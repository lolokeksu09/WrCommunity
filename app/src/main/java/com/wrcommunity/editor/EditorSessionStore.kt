package com.wrcommunity.editor

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/** Persist one private source GLB; store ongoing edits as small atomic JSON snapshots. */
data class StoredModel(val file: File, val bytes: Long, val sha256: String)

data class EditorDraft(
    val source: StoredModel,
    val name: String,
    val global: ModelEdit,
    val visible: Set<Int>,
    val parts: Map<Int, PartEdit>,
    val strokes: List<SculptStroke>,
    val selected: Int?,
    val brush: SculptStroke,
    val camera: String
) {
    fun encode(): JSONObject {
        require(source.file.name.matches(Regex("model-[a-f0-9-]{36}\\.glb")))
        require(source.bytes in 20..GlbHeader.MAX_BYTES)
        require(source.sha256.matches(Regex("[a-f0-9]{64}")))
        require(name.length in 1..160 && visible.isNotEmpty() && visible.size <= 512)
        require(parts.size <= 512 && strokes.size <= 20)
        require(global.scalePercent in 10..400)
        require(listOf(global.moveX, global.moveY, global.moveZ).all { it.isFinite() })
        parts.values.forEach { it.check() }
        strokes.forEach { it.check() }
        brush.check()
        fun stroke(v: SculptStroke) = JSONObject()
            .put("id", v.materialId).put("x", v.centerX).put("y", v.centerY)
            .put("z", v.centerZ).put("radius", v.radius)
            .put("axis", v.axis).put("strength", v.strength)
        return JSONObject().put("format", 1)
            .put("file", source.file.name).put("bytes", source.bytes)
            .put("hash", source.sha256).put("name", name).put("camera", camera)
            .put("selected", selected ?: JSONObject.NULL)
            .put("global", JSONObject()
                .put("x", global.x).put("y", global.y).put("z", global.z)
                .put("mx", global.moveX.toDouble()).put("my", global.moveY.toDouble())
                .put("mz", global.moveZ.toDouble()).put("scale", global.scalePercent))
            .put("visible", JSONArray().apply { visible.sorted().forEach { put(it) } })
            .put("parts", JSONArray().apply {
                parts.toSortedMap().forEach { (id, e) ->
                    put(JSONObject().put("id", id).put("x", e.x.toDouble())
                        .put("y", e.y.toDouble()).put("z", e.z.toDouble())
                        .put("rotation", e.rotationY).put("scale", e.scalePercent))
                }
            })
            .put("strokes", JSONArray().apply { strokes.forEach { put(stroke(it)) } })
            .put("brush", stroke(brush))
    }

    companion object {
        fun decode(root: JSONObject, folder: File): EditorDraft {
            if (root.getInt("format") != 1) throw IOException("Неизвестная версия черновика.")
            val filename = root.getString("file")
            if (!filename.matches(Regex("model-[a-f0-9-]{36}\\.glb")))
                throw IOException("Недопустимое имя модели.")
            val digest = root.getString("hash")
            if (!digest.matches(Regex("[a-f0-9]{64}"))) throw IOException("Повреждён контрольный хеш.")
            fun finite(o: JSONObject, key: String): Float {
                val n = o.getDouble(key)
                if (!n.isFinite() || n !in -10000.0..10000.0)
                    throw IOException("Некорректное число в черновике.")
                return n.toFloat()
            }
            val g = root.getJSONObject("global")
            val global = ModelEdit(g.getInt("x"), g.getInt("y"), g.getInt("z"),
                finite(g, "mx"), finite(g, "my"), finite(g, "mz"), g.getInt("scale"))
            val vis = root.getJSONArray("visible")
            if (vis.length() !in 1..512) throw IOException("Неверное количество слоёв.")
            val visible = (0 until vis.length()).map { vis.getInt(it) }.toSet()
            if (visible.size != vis.length()) throw IOException("Повторяющиеся слои.")
            val parts = linkedMapOf<Int, PartEdit>()
            val list = root.getJSONArray("parts")
            if (list.length() > 512) throw IOException("Слишком много частей.")
            for (i in 0 until list.length()) {
                val p = list.getJSONObject(i)
                val id = p.getInt("id")
                if (id in parts) throw IOException("Повторяющиеся правки.")
                val value = PartEdit(finite(p, "x"), finite(p, "y"), finite(p, "z"),
                    p.getInt("rotation"), p.getInt("scale"))
                value.check()
                parts[id] = value
            }
            fun stroke(v: JSONObject): SculptStroke =
                SculptStroke(v.getInt("id"), v.getInt("x"), v.getInt("y"),
                    v.getInt("z"), v.getInt("radius"), v.getInt("axis"),
                    v.getInt("strength")).also { it.check() }
            val arr = root.getJSONArray("strokes")
            if (arr.length() > 20) throw IOException("Слишком много штрихов.")
            val strokes = (0 until arr.length()).map { stroke(arr.getJSONObject(it)) }
            val draft = EditorDraft(
                StoredModel(File(folder, filename), root.getLong("bytes"), digest),
                root.getString("name"), global, visible, parts, strokes,
                if (root.isNull("selected")) null else root.getInt("selected"),
                stroke(root.getJSONObject("brush")), root.getString("camera"))
            draft.encode() // Apply all write-side invariants to untrusted stored data.
            return draft
        }
    }
}

/** One restored snapshot and whether the primary manifest required fallback. */
data class RestoredEditorDraft(
    val draft: EditorDraft,
    val fromBackup: Boolean,
    val fromCheckpoint: Boolean = false
)

object EditorSessionStore {
    private const val DIRECTORY = "editor-session"
    private const val JSON_NAME = "draft.json"
    private const val BACKUP_NAME = "draft.backup.json"
    private const val CHECKPOINT_NAME = "draft.checkpoint.json"
    private const val MAX_JSON = 65536L
    // A foreground debounce and an ON_PAUSE flush must never commit out of order.
    private val writeMutex = Mutex()
    private val requestOrder = AtomicLong(0L)
    // Guarded by writeMutex: a delayed worker must never replace a newer commit.
    private var lastCommittedOrder = 0L
    // Not tied to Activity/Compose cancellation: a pause flush can finish after onDestroy.
    private val backgroundScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val backgroundError = AtomicReference<String?>(null)

    fun backgroundSaveError(): String? = backgroundError.get()

    /** Best-effort immediate flush; never delay this behind the UI's debounce. */
    fun saveWhenPaused(filesDir: File, draft: EditorDraft): Job {
        // Reserve while ON_PAUSE is being handled, not when the IO worker starts.
        val order = requestOrder.incrementAndGet()
        return backgroundScope.launch {
            try {
                saveOrdered(filesDir, draft, order)
                backgroundError.set(null)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                backgroundError.set(error.message ?: "Не удалось сохранить черновик при сворачивании.")
            }
        }
    }

    internal fun folder(filesDir: File): File =
        File(filesDir, DIRECTORY).apply {
            if (!isDirectory && !mkdirs()) throw IOException("Не удалось создать папку черновика.")
        }

    private fun hash(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val block = ByteArray(65536)
            while (true) {
                val n = input.read(block)
                if (n < 0) break
                if (n > 0) digest.update(block, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /** Copy once; the old draft remains untouched until the new metadata is committed. */
    suspend fun importSource(filesDir: File, input: File): StoredModel =
        withContext(Dispatchers.IO) {
            if (!input.isFile || input.length() !in 20..GlbHeader.MAX_BYTES)
                throw IOException("Импортированная модель не найдена.")
            val dir = folder(filesDir)
            val id = UUID.randomUUID().toString()
            val destination = File(dir, "model-" + id + ".glb")
            val temp = File(dir, ".model-" + id + ".tmp")
            try {
                FileInputStream(input).use { from ->
                    FileOutputStream(temp).use { to ->
                        val block = ByteArray(65536)
                        var total = 0L
                        while (true) {
                            currentCoroutineContext().ensureActive()
                            val n = from.read(block)
                            if (n < 0) break
                            if (n == 0) continue
                            total += n
                            if (total > GlbHeader.MAX_BYTES) throw IOException("GLB слишком большой.")
                            to.write(block, 0, n)
                        }
                        to.fd.sync()
                    }
                }
                if (temp.length() != input.length()) throw IOException("GLB скопирован не полностью.")
                val digest = hash(temp)
                currentCoroutineContext().ensureActive()
                if (!temp.renameTo(destination))
                    throw IOException("Не удалось сохранить исходную модель проекта.")
                StoredModel(destination, destination.length(), digest)
            } finally { temp.delete() }
        }

    /**
     * Make a newly imported model the active recoverable project *before*
     * the UI switches to it. A failed commit leaves the prior draft intact.
     */
    suspend fun commitImportedDraft(
        filesDir: File, source: StoredModel, name: String, layerIds: Set<Int>
    ): EditorDraft {
        var committed = false
        try {
            if (layerIds.isEmpty())
                throw IOException("В импортированном GLB нет редактируемых слоёв.")
            val draft = EditorDraft(
                source = source,
                name = name,
                global = ModelEdit(),
                visible = layerIds,
                parts = emptyMap(),
                strokes = emptyList(),
                selected = null,
                brush = SculptStroke(materialId = layerIds.sorted().first()),
                camera = "FRONT"
            )
            save(filesDir, draft)
            committed = true
            return draft
        } finally {
            if (!committed) withContext(NonCancellable) {
                discardUncommittedSource(filesDir, source)
            }
        }
    }

    /**
     * Discard only a private copy that no valid current/backup manifest owns.
     * Used for failed imports, never for user documents in SAF or Downloads.
     */
    suspend fun discardUncommittedSource(filesDir: File, source: StoredModel) =
        withContext(Dispatchers.IO) {
            writeMutex.withLock {
                val dir = folder(filesDir)
                if (source.file.parentFile?.canonicalFile != dir.canonicalFile ||
                    !source.file.name.matches(Regex("model-[a-f0-9-]{36}\\.glb")))
                    throw IOException("Недопустимая временная модель.")
                val referenced = listOf(JSON_NAME, BACKUP_NAME).any { name ->
                    val file = File(dir, name)
                    file.isFile && file.length() in 2..MAX_JSON &&
                        runCatching { JSONObject(file.readText()).getString("file") }
                            .getOrNull() == source.file.name
                }
                if (!referenced) source.file.delete()
            }
        }

    suspend fun save(filesDir: File, draft: EditorDraft) =
        saveOrdered(filesDir, draft, requestOrder.incrementAndGet())

    private suspend fun saveOrdered(filesDir: File, draft: EditorDraft, order: Long) =
        withContext(Dispatchers.IO) {
            writeMutex.withLock {
                if (order < lastCommittedOrder) return@withLock
                val dir = folder(filesDir)
                if (draft.source.file.parentFile?.canonicalFile != dir.canonicalFile ||
                    !draft.source.file.isFile || draft.source.file.length() != draft.source.bytes)
                    throw IOException("Исходный файл проекта недоступен.")
                val json = draft.encode().toString().toByteArray(Charsets.UTF_8)
                if (json.size > MAX_JSON) throw IOException("Черновик слишком большой.")

                // Validate the previous committed manifest before checkpointing it.
                // Never replace a good checkpoint with malformed JSON.
                val manifest = File(dir, JSON_NAME)
                val backup = File(dir, BACKUP_NAME)
                val previousBytes = if (manifest.isFile && manifest.length() in 2..MAX_JSON)
                    manifest.readBytes() else null
                val previous = previousBytes?.let { bytes ->
                    runCatching { EditorDraft.decode(JSONObject(bytes.toString(Charsets.UTF_8)), dir) }
                        .getOrNull()
                }
                val sameSource = previous?.source == draft.source

                val temp = File(dir, ".draft-" + UUID.randomUUID() + ".tmp")
                val backupTemp = File(dir, ".backup-" + UUID.randomUUID() + ".tmp")
                try {
                    FileOutputStream(temp).use { out ->
                        out.write(json)
                        out.fd.sync()
                    }
                    currentCoroutineContext().ensureActive()

                    // Checkpoint only within the same source model. A backup
                    // pointing at a deleted source cannot recover a new project.
                    if (sameSource && previousBytes != null) {
                        FileOutputStream(backupTemp).use { out ->
                            out.write(previousBytes)
                            out.fd.sync()
                        }
                        currentCoroutineContext().ensureActive()
                        if (!backupTemp.renameTo(backup))
                            throw IOException("Не удалось сохранить резервный черновик.")
                    }
                    currentCoroutineContext().ensureActive()
                    if (!temp.renameTo(manifest))
                        throw IOException("Не удалось атомарно записать черновик.")
                    lastCommittedOrder = order

                    if (!sameSource) {
                        backup.delete()
                        // The manual checkpoint belongs to its original model;
                        // it must not be used after switching projects. Preserve
                        // it when repairing a corrupt primary of the SAME model.
                        val kept = File(dir, CHECKPOINT_NAME)
                        val checkpointSource = if (kept.isFile && kept.length() in 2..MAX_JSON) {
                            runCatching {
                                EditorDraft.decode(JSONObject(kept.readText(Charsets.UTF_8)), dir).source
                            }.getOrNull()
                        } else null
                        if (checkpointSource != draft.source) kept.delete()
                    }
                    val oldSource = previous?.source?.file
                    if (oldSource != null && oldSource != draft.source.file)
                        oldSource.delete()
                } finally {
                    temp.delete()
                    backupTemp.delete()
                }
            }
        }

    /** Checkpoint is an independent edit snapshot, not a second 150 MB GLB. */
    suspend fun saveCheckpoint(filesDir: File, draft: EditorDraft) =
        withContext(Dispatchers.IO) {
            writeMutex.withLock {
                val dir = folder(filesDir)
                val active = readChecked(File(dir, JSON_NAME), dir)
                if (active.source != draft.source)
                    throw IOException("Нельзя сохранить точку от другой модели.")
                if (draft.source.file.parentFile?.canonicalFile != dir.canonicalFile ||
                    !draft.source.file.isFile || draft.source.file.length() != draft.source.bytes ||
                    hash(draft.source.file) != draft.source.sha256)
                    throw IOException("Контрольная сумма исходного GLB не совпадает.")
                val encoded = draft.encode().toString().toByteArray(Charsets.UTF_8)
                if (encoded.size > MAX_JSON) throw IOException("Контрольная точка слишком большая.")
                val checkpoint = File(dir, CHECKPOINT_NAME)
                val tmp = File(dir, ".checkpoint-" + UUID.randomUUID() + ".tmp")
                try {
                    FileOutputStream(tmp).use { out ->
                        out.write(encoded)
                        out.fd.sync()
                    }
                    currentCoroutineContext().ensureActive()
                    if (!tmp.renameTo(checkpoint))
                        throw IOException("Не удалось записать контрольную точку.")
                } finally {
                    tmp.delete()
                }
            }
        }

    private fun readChecked(file: File, dir: File): EditorDraft {
        if (!file.isFile || file.length() !in 2..MAX_JSON)
            throw IOException("Файл черновика повреждён.")
        val draft = try {
            EditorDraft.decode(JSONObject(file.readText(Charsets.UTF_8)), dir)
        } catch (_: Exception) {
            throw IOException("Не удалось прочитать черновик.")
        }
        if (!draft.source.file.isFile ||
            draft.source.file.length() != draft.source.bytes ||
            hash(draft.source.file) != draft.source.sha256)
            throw IOException("Контрольная сумма исходной модели не совпадает.")
        return draft
    }

    /** Load a checkpoint only if it still refers to the active project. */
    suspend fun readCheckpoint(filesDir: File): EditorDraft? = withContext(Dispatchers.IO) {
        writeMutex.withLock {
            val dir = folder(filesDir)
            val checkpoint = File(dir, CHECKPOINT_NAME)
            if (!checkpoint.exists()) return@withLock null
            val saved = readChecked(checkpoint, dir)
            val active = runCatching { readChecked(File(dir, JSON_NAME), dir) }.getOrNull()
                ?: runCatching { readChecked(File(dir, BACKUP_NAME), dir) }.getOrNull()
            if (active != null && active.source != saved.source)
                throw IOException("Контрольная точка от другой модели.")
            saved
        }
    }

    /**
     * Restoring makes the checkpoint the current autosaved draft.
     * The checkpoint itself remains available for future manual restores.
     */
    suspend fun restoreCheckpoint(filesDir: File): EditorDraft {
        val checkpoint = readCheckpoint(filesDir)
            ?: throw IOException("Нет сохранённой контрольной точки.")
        save(filesDir, checkpoint)
        val committed = restore(filesDir)
            ?: throw IOException("Не удалось применить контрольную точку.")
        if (committed != checkpoint)
            throw IOException("Контрольная точка не применена из-за нового изменения.")
        return committed
    }

    suspend fun restore(filesDir: File): EditorDraft? = restoreWithStatus(filesDir)?.draft

    suspend fun restoreWithStatus(filesDir: File): RestoredEditorDraft? =
        withContext(Dispatchers.IO) {
            // A read must not race the commit or source reclamation.
            writeMutex.withLock {
                val dir = folder(filesDir)
                val manifest = File(dir, JSON_NAME)
                val backup = File(dir, BACKUP_NAME)
                val checkpoint = File(dir, CHECKPOINT_NAME)
                if (!manifest.exists() && !backup.exists() && !checkpoint.exists())
                    return@withLock null

                // Fully validate hashes on EACH candidate; a stale or tampered
                // source cannot be brought back by a backup or checkpoint.
                val primary = runCatching { readChecked(manifest, dir) }.getOrNull()
                if (primary != null) {
                    RestoredEditorDraft(primary, fromBackup = false)
                } else {
                    val backed = runCatching { readChecked(backup, dir) }.getOrNull()
                    if (backed != null) {
                        RestoredEditorDraft(backed, fromBackup = true)
                    } else {
                        val manual = runCatching { readChecked(checkpoint, dir) }.getOrNull()
                            ?: throw IOException("Основной, резервный черновики и контрольная точка недоступны.")
                        RestoredEditorDraft(manual, fromBackup = false, fromCheckpoint = true)
                    }
                }
            }
        }
}
