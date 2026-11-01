package com.wrcommunity.editor

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

data class MaterialLayer(val id: Int, val name: String, val primitives: Int)

/** Reversible history of visible material groups; zero visible materials is forbidden. */
data class LayerHistory(
    val states: List<Set<Int>> = listOf(emptySet()),
    val index: Int = 0
) {
    val current: Set<Int> get() = states[index]
    val canUndo: Boolean get() = index > 0
    val canRedo: Boolean get() = index < states.lastIndex
    fun change(next: Set<Int>): LayerHistory {
        if (next.isEmpty() || next == current) return this
        val branch = states.take(index + 1).takeLast(49) + setOf(next.toSet())
        return LayerHistory(branch, branch.lastIndex)
    }
    fun undo() = if (canUndo) copy(index = index - 1) else this
    fun redo() = if (canRedo) copy(index = index + 1) else this
}

/** GLB 2.0 material groups: whole primitives, NOT arbitrary face/vertex selections. */
object GlbLayers {
    private const val MAGIC = 0x46546C67
    private const val JSON_CHUNK = 0x4E4F534A

    private fun sourceJson(data: ByteArray): JSONObject {
        if (data.size < 20 || data.size > GlbHeader.MAX_BYTES)
            throw IOException("Размер GLB недопустим.")
        GlbValidation.error(data.copyOfRange(0, 20), data.size.toLong())
            ?.let { throw IOException(it) }
        val jsonLength = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        return try {
            JSONObject(String(data, 20, jsonLength, Charsets.UTF_8).trimEnd(' ', '\u0000'))
        } catch (_: Exception) {
            throw IOException("Повреждён JSON-блок GLB.")
        }
    }

    fun layers(data: ByteArray): List<MaterialLayer> {
        val root = sourceJson(data)
        val materials = root.optJSONArray("materials")
        val counts = linkedMapOf<Int, Int>()
        val meshes = root.optJSONArray("meshes") ?: JSONArray()
        for (m in 0 until meshes.length()) {
            val primitives = meshes.optJSONObject(m)?.optJSONArray("primitives") ?: continue
            for (p in 0 until primitives.length()) {
                val part = primitives.optJSONObject(p) ?: continue
                val id = part.optInt("material", -1)
                counts[id] = (counts[id] ?: 0) + 1
            }
        }
        return counts.map { (id, count) ->
            val raw = if (id < 0) null else materials?.optJSONObject(id)?.optString("name")
            MaterialLayer(id, raw?.takeIf { it.isNotBlank() } ?: if (id < 0) "Без материала" else "Материал ${id + 1}", count)
        }
    }

    /** Each filtered GLB keeps original accessors, bufferViews, textures and binary chunks. */
    fun filter(data: ByteArray, visible: Set<Int>): ByteArray {
        if (visible.isEmpty()) throw IOException("Нужно оставить хотя бы один видимый слой.")
        val root = sourceJson(data)
        val meshes = root.optJSONArray("meshes") ?: return data.copyOf()
        val cleared = hashSetOf<Int>()
        var removed = false
        var kept = 0
        for (m in 0 until meshes.length()) {
            val mesh = meshes.optJSONObject(m) ?: continue
            val parts = mesh.optJSONArray("primitives") ?: continue
            val accepted = JSONArray()
            for (p in 0 until parts.length()) {
                val primitive = parts.optJSONObject(p) ?: continue
                if (primitive.optInt("material", -1) in visible) {
                    accepted.put(primitive)
                    kept++
                } else removed = true
            }
            if (accepted.length() == 0) {
                cleared.add(m)
                // Unreferenced mesh keeps its valid original primitives.
            } else if (accepted.length() != parts.length()) {
                mesh.put("primitives", accepted)
            }
        }
        if (kept == 0) throw IOException("Нельзя скрыть все части модели.")
        if (!removed) return data.copyOf()
        if (cleared.isNotEmpty()) {
            val nodes = root.optJSONArray("nodes") ?: JSONArray()
            for (i in 0 until nodes.length()) {
                val node = nodes.optJSONObject(i) ?: continue
                if (node.has("mesh") && node.optInt("mesh", -1) in cleared) node.remove("mesh")
            }
        }
        return rewriteJson(data, root)
    }

    internal fun rewriteJson(source: ByteArray, json: JSONObject): ByteArray {
        val oldLen = ByteBuffer.wrap(source).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val tailStart = 20L + oldLen
        val payload = json.toString().toByteArray(Charsets.UTF_8)
        val padded = (payload.size.toLong() + 3L) and -4L
        val outLen = 20L + padded + (source.size.toLong() - tailStart)
        if (outLen > GlbHeader.MAX_BYTES || outLen > Int.MAX_VALUE)
            throw IOException("После обработки GLB превышает 150 МБ.")
        val out = ByteBuffer.allocate(outLen.toInt()).order(ByteOrder.LITTLE_ENDIAN)
        out.putInt(MAGIC).putInt(2).putInt(outLen.toInt())
        out.putInt(padded.toInt()).putInt(JSON_CHUNK).put(payload)
        repeat(padded.toInt() - payload.size) { out.put(32.toByte()) }
        out.put(source, tailStart.toInt(), source.size - tailStart.toInt())
        return out.array()
    }

    /** SAF cache file generation, not direct mutation of the user's document. */
    suspend fun preview(context: Context, sourceLocation: String, visible: Set<Int>): String =
        withContext(Dispatchers.IO) {
            val src = File(Uri.parse(sourceLocation).path ?: throw IOException("GLB недоступен."))
            val dst = File(context.cacheDir, "layer-view-${UUID.randomUUID()}.glb")
            try {
                dst.writeBytes(filter(src.readBytes(), visible))
                Uri.fromFile(dst).toString()
            } catch (e: Exception) {
                dst.delete()
                throw e
            }
        }

    suspend fun describe(context: Context, sourceLocation: String): List<MaterialLayer> =
        withContext(Dispatchers.IO) {
            val src = File(Uri.parse(sourceLocation).path ?: throw IOException("GLB недоступен."))
            layers(src.readBytes())
        }
}
