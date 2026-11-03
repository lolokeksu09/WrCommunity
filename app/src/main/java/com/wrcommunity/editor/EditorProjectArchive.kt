package com.wrcommunity.editor

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

/**
 * Portable and bounded two-entry ZIP:
 *   draft.json (the existing validated EditorDraft JSON format)
 *   model.glb  (the exact original GLB, never an exported/modified mesh)
 *
 * Import validates the entire archive BEFORE committing a different project.
 * No ZIP entry paths are ever used as filesystem paths.
 */
object EditorProjectArchive {
    private const val MODEL_ENTRY = "model.glb"
    private const val DRAFT_ENTRY = "draft.json"
    private const val MAX_DRAFT_BYTES = 65536L
    private const val ZIP_OVERHEAD = 2L * 1024 * 1024
    private const val MAX_ARCHIVE_BYTES = GlbHeader.MAX_BYTES + ZIP_OVERHEAD
    private const val BUFFER = 65536

    private fun digest(file: File): String {
        val hash = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val bytes = ByteArray(BUFFER)
            while (true) {
                val count = input.read(bytes)
                if (count < 0) break
                if (count > 0) hash.update(bytes, 0, count)
            }
        }
        return hash.digest().joinToString("") { "%02x".format(it) }
    }

    /**
     * The output is closed after the ZIP is complete. Call from Dispatchers.IO.
     * Do not report success until the SAF provider has also finished writing.
     */
    fun write(output: OutputStream, draft: EditorDraft) {
        val manifest = draft.encode().toString().toByteArray(Charsets.UTF_8)
        if (manifest.size !in 2..MAX_DRAFT_BYTES.toInt())
            throw IOException("Описание проекта слишком большое.")
        val source = draft.source.file
        if (!source.isFile || source.length() != draft.source.bytes ||
            source.length() !in 20..GlbHeader.MAX_BYTES ||
            digest(source) != draft.source.sha256)
            throw IOException("Исходный GLB проекта повреждён; копия не создана.")

        ZipOutputStream(output).use { zip ->
            zip.setLevel(1)
            zip.putNextEntry(ZipEntry(DRAFT_ENTRY))
            zip.write(manifest)
            zip.closeEntry()
            zip.putNextEntry(ZipEntry(MODEL_ENTRY))
            FileInputStream(source).use { model ->
                val block = ByteArray(BUFFER)
                while (true) {
                    val count = model.read(block)
                    if (count < 0) break
                    if (count > 0) zip.write(block, 0, count)
                }
            }
            zip.closeEntry()
        }
    }

    /** Copy the upload to a private bounded staging area for ZIP central-directory
     * validation. A failed archive is never committed over the active draft. */
    suspend fun import(filesDir: File, input: InputStream): EditorDraft =
        withContext(Dispatchers.IO) {
            val stageFolder = File(filesDir, "editor-archive-import")
            if (!stageFolder.isDirectory && !stageFolder.mkdirs())
                throw IOException("Не удалось создать временную папку.")
            val id = UUID.randomUUID().toString()
            val zipPath = File(stageFolder, "$id.zip")
            val glbPath = File(stageFolder, "$id.glb")
            var imported: StoredModel? = null
            var committed = false
            try {
                var archiveBytes = 0L
                FileOutputStream(zipPath).use { out ->
                    input.use { source ->
                        val block = ByteArray(BUFFER)
                        while (true) {
                            currentCoroutineContext().ensureActive()
                            val count = source.read(block)
                            if (count < 0) break
                            if (count == 0) continue
                            archiveBytes += count
                            if (archiveBytes > MAX_ARCHIVE_BYTES)
                                throw IOException("Архив проекта превышает ограничение 152 МБ.")
                            out.write(block, 0, count)
                        }
                    }
                    out.fd.sync()
                }

                val draftBytes: ByteArray
                ZipFile(zipPath).use { zip ->
                    val entries = zip.entries().asSequence().toList()
                    if (entries.size != 2 || entries.map { it.name }.toSet() !=
                        setOf(DRAFT_ENTRY, MODEL_ENTRY) || entries.any { it.isDirectory })
                        throw IOException("Архив должен содержать только draft.json и model.glb.")
                    val manifest = zip.getEntry(DRAFT_ENTRY)
                        ?: throw IOException("В архиве отсутствует черновик.")
                    val model = zip.getEntry(MODEL_ENTRY)
                        ?: throw IOException("В архиве отсутствует GLB.")
                    if (manifest.size > MAX_DRAFT_BYTES || model.size > GlbHeader.MAX_BYTES)
                        throw IOException("Содержимое архива слишком большое.")
                    draftBytes = zip.getInputStream(manifest).use { source ->
                        val out = java.io.ByteArrayOutputStream()
                        val block = ByteArray(BUFFER)
                        while (true) {
                            currentCoroutineContext().ensureActive()
                            val count = source.read(block)
                            if (count < 0) break
                            if (count == 0) continue
                            if (out.size().toLong() + count > MAX_DRAFT_BYTES)
                                throw IOException("Черновик архива слишком большой.")
                            out.write(block, 0, count)
                        }
                        out.toByteArray()
                    }
                    zip.getInputStream(model).use { source ->
                        FileOutputStream(glbPath).use { out ->
                            val block = ByteArray(BUFFER)
                            var total = 0L
                            while (true) {
                                currentCoroutineContext().ensureActive()
                                val count = source.read(block)
                                if (count < 0) break
                                if (count == 0) continue
                                total += count
                                if (total > GlbHeader.MAX_BYTES)
                                    throw IOException("GLB в архиве превышает 150 МБ.")
                                out.write(block, 0, count)
                            }
                            out.fd.sync()
                        }
                    }
                }

                val original = try {
                    EditorDraft.decode(
                        JSONObject(draftBytes.toString(Charsets.UTF_8)),
                        EditorSessionStore.folder(filesDir))
                } catch (error: Exception) {
                    throw IOException("Описание проекта повреждено.", error)
                }
                if (original.source.bytes != glbPath.length() ||
                    original.source.sha256 != digest(glbPath))
                    throw IOException("Контрольная сумма GLB в архиве не совпадает.")

                // Validate the 3D structure and every saved material reference
                // before the old project can be replaced.
                val glb = glbPath.readBytes()
                GlbIntegrity.validate(glb)
                val available = GlbLayers.layers(glb).map { it.id }.toSet()
                if (available.isEmpty() || !original.visible.all { it in available } ||
                    !original.parts.keys.all { it in available } ||
                    !original.strokes.all { it.materialId in available } ||
                    original.brush.materialId !in available ||
                    (original.selected != null && original.selected !in available))
                    throw IOException("Правки архива ссылаются на отсутствующие материалы.")

                imported = EditorSessionStore.importSource(filesDir, glbPath)
                val restored = original.copy(source = imported)
                EditorSessionStore.save(filesDir, restored)
                committed = true
                restored
            } finally {
                if (!committed) imported?.let { source ->
                    // The store refuses to delete anything referenced by a
                    // committed primary/backup. Never touch SAF user originals.
                    withContext(kotlinx.coroutines.NonCancellable) {
                        EditorSessionStore.discardUncommittedSource(filesDir, source)
                    }
                }
                glbPath.delete()
                zipPath.delete()
            }
        }
}
