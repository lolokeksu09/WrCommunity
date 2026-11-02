package com.wrcommunity.editor

import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * Rebuilds NORMAL only for primitives whose POSITION was edited.
 * Reads original index data, produces private tightly-packed FLOAT VEC3 normals
 * and never modifies shared normal accessors or existing BIN bytes.
 */
internal object GlbNormals {
    fun rebuild(
        glb: ByteBuffer,
        binStart: Long,
        binByteLength: Long,
        primitive: JSONObject,
        attributes: JSONObject,
        oldAccessors: JSONArray,
        views: JSONArray,
        positions: FloatArray,
        append: ByteArrayOutputStream,
        originalBinSize: Int
    ) {
        if (!attributes.has("NORMAL")) return
        if (primitive.optInt("mode", 4) != 4)
            throw IOException("Пересчёт нормалей поддерживает только TRIANGLES.")
        if (attributes.has("TANGENT"))
            throw IOException("Правка сетки с TANGENT пока недоступна.")

        val normalId = attributes.optInt("NORMAL", -1)
        if (normalId !in 0 until oldAccessors.length())
            throw IOException("Некорректный NORMAL accessor.")
        val normal = oldAccessors.getJSONObject(normalId)
        val count = positions.size / 3
        if (normal.optInt("componentType") != 5126 ||
            normal.optString("type") != "VEC3" ||
            normal.optInt("count") != count ||
            normal.has("sparse") ||
            normal.optBoolean("normalized", false)
        ) throw IOException("Для правки нужны NORMAL FLOAT VEC3.")

        val indices = indexSequence(glb, binStart, binByteLength,
            primitive, oldAccessors, views, count)
        val sums = DoubleArray(count * 3)
        val involved = BooleanArray(count)
        val p = positions

        for (i in indices.indices step 3) {
            val a = indices[i]
            val b = indices[i + 1]
            val c = indices[i + 2]
            val ax = p[a * 3].toDouble()
            val ay = p[a * 3 + 1].toDouble()
            val az = p[a * 3 + 2].toDouble()
            val ux = p[b * 3] - ax
            val uy = p[b * 3 + 1] - ay
            val uz = p[b * 3 + 2] - az
            val vx = p[c * 3] - ax
            val vy = p[c * 3 + 1] - ay
            val vz = p[c * 3 + 2] - az
            val nx = uy * vz - uz * vy
            val ny = uz * vx - ux * vz
            val nz = ux * vy - uy * vx
            val length2 = nx * nx + ny * ny + nz * nz
            if (!length2.isFinite()) throw IOException("Повреждённая геометрия треугольников.")
            if (length2 < 1e-24) continue
            for (v in intArrayOf(a, b, c)) {
                sums[v * 3] += nx
                sums[v * 3 + 1] += ny
                sums[v * 3 + 2] += nz
                involved[v] = true
            }
        }

        val originalViewId = normal.optInt("bufferView", -1)
        if (originalViewId !in 0 until views.length())
            throw IOException("NORMAL bufferView отсутствует.")
        val view = views.getJSONObject(originalViewId)
        if (view.optInt("buffer", -1) != 0) throw IOException("NORMAL вне BIN.")
        val stride = view.optInt("byteStride", 12)
        val offset = view.optLong("byteOffset", 0) + normal.optLong("byteOffset", 0)
        val end = offset + (count.toLong() - 1) * stride + 12
        if (stride < 12 || stride % 4 != 0 || offset < 0 ||
            end > view.optLong("byteOffset", 0) + view.getLong("byteLength") ||
            end > binByteLength) throw IOException("NORMAL вне границ BIN.")

        val packed = ByteBuffer.allocate(count * 12).order(ByteOrder.LITTLE_ENDIAN)
        for (v in 0 until count) {
            val off = v * 3
            val x = sums[off]
            val y = sums[off + 1]
            val z = sums[off + 2]
            val len = sqrt(x * x + y * y + z * z)
            if (involved[v] && len > 1e-12 && len.isFinite()) {
                packed.putFloat((x / len).toFloat())
                packed.putFloat((y / len).toFloat())
                packed.putFloat((z / len).toFloat())
            } else {
                // Degenerate / unused vertices retain their previous normal.
                val base = binStart + offset + v.toLong() * stride
                val nx = glb.getFloat(base.toInt())
                val ny = glb.getFloat((base + 4).toInt())
                val nz = glb.getFloat((base + 8).toInt())
                if (!nx.isFinite() || !ny.isFinite() || !nz.isFinite())
                    throw IOException("Повреждённые исходные нормали.")
                packed.putFloat(nx)
                packed.putFloat(ny)
                packed.putFloat(nz)
            }
        }
        while ((originalBinSize + append.size()) % 4 != 0) append.write(0)
        val byteOffset = originalBinSize + append.size()
        val buffer = packed.array()
        append.write(buffer)
        val newViewId = views.length()
        views.put(JSONObject().put("buffer", 0)
            .put("byteOffset", byteOffset).put("byteLength", buffer.size).put("target", 34962))
        val newAccessor = JSONObject(normal.toString())
            .put("bufferView", newViewId).put("byteOffset", 0)
        newAccessor.remove("min")
        newAccessor.remove("max")
        val newAccessorId = oldAccessors.length()
        oldAccessors.put(newAccessor)
        attributes.put("NORMAL", newAccessorId)
    }

    private fun indexSequence(
        bytes: ByteBuffer, binStart: Long, binByteLength: Long,
        primitive: JSONObject, accessors: JSONArray, views: JSONArray,
        vertexCount: Int
    ): IntArray {
        if (!primitive.has("indices")) {
            if (vertexCount % 3 != 0)
                throw IOException("Неиндексированные треугольники должны иметь кратное 3 число вершин.")
            return IntArray(vertexCount) { it }
        }
        val id = primitive.optInt("indices", -1)
        if (id !in 0 until accessors.length()) throw IOException("Неверный индексный accessor.")
        val accessor = accessors.getJSONObject(id)
        if (accessor.has("sparse") || accessor.optString("type") != "SCALAR")
            throw IOException("Неподдерживаемые индексы треугольников.")
        val itemSize = when (accessor.optInt("componentType")) {
            5121 -> 1
            5123 -> 2
            5125 -> 4
            else -> throw IOException("Неверный формат индексов.")
        }
        val count = accessor.optInt("count", -1)
        if (count <= 0 || count % 3 != 0 || count > 6_000_000)
            throw IOException("Неверное количество индексов.")
        val viewId = accessor.optInt("bufferView", -1)
        if (viewId !in 0 until views.length())
            throw IOException("Отсутствует index bufferView.")
        val view = views.getJSONObject(viewId)
        if (view.optInt("buffer", -1) != 0) throw IOException("Индексы вне BIN.")
        val stride = view.optInt("byteStride", itemSize)
        val start = view.optLong("byteOffset", 0) + accessor.optLong("byteOffset", 0)
        val end = start + (count.toLong() - 1) * stride + itemSize
        if (stride < itemSize || stride % itemSize != 0 ||
            start < 0 || end > binByteLength ||
            end > view.optLong("byteOffset", 0) + view.getLong("byteLength"))
            throw IOException("Индексы выходят за пределы BIN.")
        return IntArray(count) { i ->
            val pos = (binStart + start + i.toLong() * stride).toInt()
            val index = when (itemSize) {
                1 -> bytes.get(pos).toInt() and 0xff
                2 -> bytes.getShort(pos).toInt() and 0xffff
                else -> bytes.getInt(pos).toLong() and 0xffffffffL
            }
            if (index.toLong() !in 0 until vertexCount.toLong())
                throw IOException("Индекс вершины выходит за границы POSITION.")
            index.toInt()
        }
    }
}
