package com.wrcommunity.editor

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.nio.ByteBuffer
import kotlin.math.pow

/**
 * One-pass, locally weighted Laplacian smoothing.
 *
 * Neighbor averages are derived from the indexed triangle topology, without
 * altering indices or the original BIN chunk. Vertex updates are simultaneous
 * to avoid dependence on triangle traversal order.
 */
internal object GlbSmoothing {
    fun smooth(
        data: ByteBuffer,
        binStart: Long,
        binLength: Long,
        primitive: JSONObject,
        accessors: JSONArray,
        views: JSONArray,
        vertices: FloatArray,
        cx: Float,
        cy: Float,
        cz: Float,
        radius: Float,
        strengthPercent: Int
    ) {
        if (primitive.optInt("mode", 4) != 4 || primitive.has("targets"))
            throw IOException("Сглаживание поддерживает только TRIANGLES.")
        if (!primitive.has("indices"))
            throw IOException("Для сглаживания нужна индексированная сетка.")
        val accessorIndex = primitive.optInt("indices", -1)
        if (accessorIndex !in 0 until accessors.length())
            throw IOException("Не найден индексный accessor.")
        val accessor = accessors.getJSONObject(accessorIndex)
        val size = when (accessor.optInt("componentType")) {
            5121 -> 1
            5123 -> 2
            5125 -> 4
            else -> throw IOException("Неподдерживаемый формат индексов.")
        }
        if (accessor.optString("type") != "SCALAR" || accessor.has("sparse"))
            throw IOException("Индексы должны быть обычным SCALAR.")
        val count = accessor.optInt("count", -1)
        if (count <= 0 || count % 3 != 0 || count > 6_000_000)
            throw IOException("Некорректное количество треугольников.")
        val viewId = accessor.optInt("bufferView", -1)
        if (viewId !in 0 until views.length())
            throw IOException("Нет index bufferView.")
        val view = views.getJSONObject(viewId)
        if (view.optInt("buffer", -1) != 0)
            throw IOException("Индексы должны быть в GLB.")
        val stride = view.optInt("byteStride", size)
        val offset = view.optLong("byteOffset", 0) + accessor.optLong("byteOffset", 0)
        val end = offset + (count.toLong() - 1) * stride + size
        if (stride < size || stride % size != 0 || offset < 0 ||
            end > binLength ||
            end > view.optLong("byteOffset", 0) + view.getLong("byteLength"))
            throw IOException("Индексы выходят за пределы GLB.")
        val vertexCount = vertices.size / 3
        val sums = FloatArray(vertices.size)
        val counts = IntArray(vertexCount)
        fun index(i: Int): Int {
            val at = (binStart + offset + i.toLong() * stride).toInt()
            val n = when (size) {
                1 -> data.get(at).toLong() and 255
                2 -> data.getShort(at).toLong() and 65535
                else -> data.getInt(at).toLong() and 0xffffffffL
            }
            if (n >= vertexCount.toLong())
                throw IOException("Индекс треугольника вне границ POSITION.")
            return n.toInt()
        }
        fun addNeighbors(v: Int, a: Int, b: Int) {
            val i = v * 3
            val a3 = a * 3
            val b3 = b * 3
            for (axis in 0..2)
                sums[i + axis] += vertices[a3 + axis] + vertices[b3 + axis]
            counts[v] += 2
        }
        for (t in 0 until count step 3) {
            val a = index(t)
            val b = index(t + 1)
            val c = index(t + 2)
            if (a == b || b == c || c == a) continue
            addNeighbors(a, b, c)
            addNeighbors(b, c, a)
            addNeighbors(c, a, b)
        }
        if (radius <= 0f || !radius.isFinite())
            throw IOException("Недопустимый радиус кисти.")
        val radiusSquared = radius * radius
        val amount = strengthPercent.coerceIn(1, 20) / 100f
        // All target positions read the SAME original vertex array.
        val next = vertices.copyOf()
        for (i in 0 until vertexCount) {
            if (counts[i] == 0) continue
            val k = i * 3
            val dx = vertices[k] - cx
            val dy = vertices[k + 1] - cy
            val dz = vertices[k + 2] - cz
            val q = (dx * dx + dy * dy + dz * dz) / radiusSquared
            if (q >= 1f) continue
            val blend = amount * (1f - q).pow(2)
            for (axis in 0..2) {
                val average = sums[k + axis] / counts[i]
                next[k + axis] = vertices[k + axis] +
                    (average - vertices[k + axis]) * blend
            }
        }
        next.copyInto(vertices)
    }
}
