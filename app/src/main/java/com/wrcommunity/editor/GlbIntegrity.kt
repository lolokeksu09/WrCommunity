package com.wrcommunity.editor

import org.json.JSONObject
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Validates the complete GLB chunk chain and essential glTF references before
 * and after export. Neither the original document nor its BIN chunk is modified.
 */
object GlbIntegrity {
    fun validate(data: ByteArray) {
        GlbValidation.error(data.copyOfRange(0, minOf(20, data.size)), data.size.toLong())
            ?.let { throw IOException(it) }
        val buffer = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
        val jsonLength = buffer.getInt(12)
        var position = 20L + jsonLength
        val json = try {
            JSONObject(String(data, 20, jsonLength, Charsets.UTF_8).trimEnd(' ', '\u0000'))
        } catch (_: Exception) { throw IOException("GLB содержит повреждённый JSON.") }
        val version = json.optJSONObject("asset")?.optString("version")
        if (version != "2.0") throw IOException("Поддерживается только glTF 2.0.")

        var binaryLength = 0L
        var sawBin = false
        while (position < data.size.toLong()) {
            if (data.size.toLong() - position < 8) throw IOException("GLB содержит обрезанный чанк.")
            val size = buffer.getInt(position.toInt()).toLong() and 0xffffffffL
            val kind = buffer.getInt(position.toInt() + 4)
            if (size % 4L != 0L || size > data.size.toLong() - position - 8L)
                throw IOException("Размер чанка GLB повреждён.")
            if (kind != 0x004E4942 || sawBin) throw IOException("Неподдерживаемая структура чанков GLB.")
            sawBin = true
            binaryLength = size
            position += 8L + size
        }
        if (position != data.size.toLong()) throw IOException("Неверная длина GLB.")

        val buffers = json.optJSONArray("buffers")
        if (buffers != null && buffers.length() > 0) {
            if (buffers.length() != 1 || !sawBin) throw IOException("GLB должен иметь один встроенный BIN.")
            val item = buffers.optJSONObject(0) ?: throw IOException("Повреждён buffers.")
            if (item.has("uri")) throw IOException("Внешние буферы не поддерживаются.")
            val expected = item.optLong("byteLength", -1)
            if (expected < 0 || expected > binaryLength || binaryLength - expected > 3)
                throw IOException("Неверный размер buffers[0].")
        }
        val nodes = json.optJSONArray("nodes")
        val meshes = json.optJSONArray("meshes")
        val scenes = json.optJSONArray("scenes") ?: throw IOException("Нет сцены GLB.")
        if (scenes.length() == 0) throw IOException("Сцена GLB пуста.")
        val selectedScene = json.optInt("scene", 0)
        if (selectedScene !in 0 until scenes.length()) throw IOException("Некорректная текущая сцена.")
        for (i in 0 until scenes.length()) {
            val roots = scenes.optJSONObject(i)?.optJSONArray("nodes")
                ?: throw IOException("Повреждённые корневые узлы сцены.")
            for (j in 0 until roots.length()) {
                val id = roots.optInt(j, -1)
                if (nodes == null || id !in 0 until nodes.length())
                    throw IOException("Сцена ссылается на отсутствующий узел.")
            }
        }
        if (nodes != null) for (i in 0 until nodes.length()) {
            val n = nodes.optJSONObject(i) ?: throw IOException("Повреждён node.")
            if (n.has("mesh") && (meshes == null || n.optInt("mesh", -1) !in 0 until meshes.length()))
                throw IOException("Узел ссылается на отсутствующую сетку.")
            val children = n.optJSONArray("children")
            if (children != null) for (j in 0 until children.length()) {
                if (children.optInt(j, -1) !in 0 until nodes.length())
                    throw IOException("Некорректная ссылка на дочерний узел.")
            }
        }
        val views = json.optJSONArray("bufferViews")
        if (views != null) for (i in 0 until views.length()) {
            val v = views.optJSONObject(i) ?: throw IOException("Повреждён bufferView.")
            if (v.optInt("buffer", -1) != 0 || !sawBin)
                throw IOException("bufferView указывает на отсутствующий BIN.")
            val offset = v.optLong("byteOffset", 0)
            val length = v.optLong("byteLength", -1)
            if (offset < 0 || length < 0 || offset > binaryLength || length > binaryLength - offset)
                throw IOException("bufferView выходит за границы BIN.")
        }
        val accessors = json.optJSONArray("accessors")
        if (accessors != null) for (i in 0 until accessors.length()) {
            val a = accessors.optJSONObject(i) ?: throw IOException("Повреждён accessor.")
            if (a.has("bufferView") && (views == null ||
                a.optInt("bufferView", -1) !in 0 until views.length()))
                throw IOException("Accessor ссылается на отсутствующий bufferView.")
        }
        if (meshes != null) for (i in 0 until meshes.length()) {
            val primitives = meshes.optJSONObject(i)?.optJSONArray("primitives")
                ?: throw IOException("Сетка без primitives.")
            if (primitives.length() == 0) throw IOException("Сетка без геометрии.")
            for (j in 0 until primitives.length()) {
                val p = primitives.optJSONObject(j) ?: throw IOException("Некорректный primitive.")
                val attrs = p.optJSONObject("attributes") ?: throw IOException("Нет атрибутов primitive.")
                val keys = attrs.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    if (accessors == null || attrs.optInt(key, -1) !in 0 until accessors.length())
                        throw IOException("Атрибут ссылается на отсутствующий accessor.")
                }
                if (p.has("indices") && (accessors == null ||
                    p.optInt("indices", -1) !in 0 until accessors.length()))
                    throw IOException("Индексы ссылаются на отсутствующий accessor.")
            }
        }
    }
}
