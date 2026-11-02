package com.wrcommunity.editor

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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

object EditorSessionStore {
    private const val DIRECTORY = "editor-session"
    private const val JSON_NAME = "draft.json"
    private const val MAX_JSON = 65536L
    // A foreground debounce and an ON_PAUSE flush must never commit out of order.
    private val writeMutex = Mutex()
    // Not tied to Activity/Compose cancellation: a pause flush can finish after onDestroy.
    private val backgroundScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val backgroundError = AtomicReference<String?>(null)

    fun backgroundSaveError(): String? = backgroundError.get()

    /** Best-effort immediate flush; never delay this behind the UI's debounce. */
    fun saveWhenPaused(filesDir: File, draft: EditorDraft): Job = backgroundScope.launch {
        try {
            save(filesDir, draft)
            backgroundError.set(null)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            backgroundError.set(error.message ?: "Не удалось сохранить черновик при сворачивании.")
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

    suspend fun save(filesDir: File, draft: EditorDraft) =
        withContext(Dispatchers.IO) {
            writeMutex.withLock {
            val dir = folder(filesDir)
            if (draft.source.file.parentFile?.canonicalFile != dir.canonicalFile ||
                !draft.source.file.isFile || draft.source.file.length() != draft.source.bytes)
                throw IOException("Исходный файл проекта недоступен.")
            val json = draft.encode().toString().toByteArray(Charsets.UTF_8)
            if (json.size > MAX_JSON) throw IOException("Черновик слишком большой.")
            val temp = File(dir, ".draft-" + UUID.randomUUID() + ".tmp")
            try {
                FileOutputStream(temp).use { out ->
                    out.write(json)
                    out.fd.sync()
                }
                currentCoroutineContext().ensureActive()
                if (!temp.renameTo(File(dir, JSON_NAME)))
                    throw IOException("Не удалось атомарно записать черновик.")
                // Clean only editor-owned copies; never modify user Downloads.
                dir.listFiles()?.filter {
                    it.isFile && it.name.matches(Regex("model-[a-f0-9-]{36}\\.glb")) &&
                        it.name != draft.source.file.name
                }?.forEach { it.delete() }
            } finally { temp.delete() }
            }
        }

    suspend fun restore(filesDir: File): EditorDraft? =
        withContext(Dispatchers.IO) {
            val dir = folder(filesDir)
            val manifest = File(dir, JSON_NAME)
            if (!manifest.exists()) return@withContext null
            if (!manifest.isFile || manifest.length() !in 2..MAX_JSON)
                throw IOException("Файл черновика повреждён.")
            val saved = try {
                EditorDraft.decode(JSONObject(manifest.readText()), dir)
            } catch (_: Exception) { throw IOException("Не удалось прочитать черновик.") }
            if (!saved.source.file.isFile ||
                saved.source.file.length() != saved.source.bytes ||
                hash(saved.source.file) != saved.source.sha256)
                throw IOException("Контрольная сумма исходной модели не совпадает.")
            saved
        }
}
