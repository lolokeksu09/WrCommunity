package com.wrcommunity.editor

import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.roundToInt

/** Ray and hit use the original glTF mesh-local coordinate system. */
data class SurfaceRay(
    val ox: Float, val oy: Float, val oz: Float,
    val dx: Float, val dy: Float, val dz: Float
)
data class SurfaceHit(
    val materialId: Int,
    val x: Float, val y: Float, val z: Float,
    val distance: Float,
    val center: BrushTarget
)

/**
 * Exact closest TRIANGLES intersection (Möller–Trumbore), limited to one
 * untransformed mesh node. Mesh data is decoded once, off the UI thread.
 *
 * The closest hit is computed over all VISIBLE materials, then checked
 * against the selected material; occluded materials are not accidentally
 * sculpted through a visible front surface.
 */
class GlbSurfacePicker private constructor(private val parts: List<Part>) {
    private class Part(
        val material: Int,
        val positions: FloatArray,
        val triangles: IntArray,
        val bounds: FloatArray // min x/y/z, max x/y/z
    ) {
        // Construction happens on Dispatchers.Default before the picker is exposed.
        val tree = TriangleBvh(positions, triangles)
    }
    val materialIds: Set<Int> = parts.mapTo(linkedSetOf()) { it.material }

    fun pick(ray: SurfaceRay, selectedMaterial: Int, visible: Set<Int>): SurfaceHit? {
        if (selectedMaterial !in visible || !ray.ox.isFinite() || !ray.oy.isFinite() ||
            !ray.oz.isFinite() || !ray.dx.isFinite() || !ray.dy.isFinite() ||
            !ray.dz.isFinite()) return null
        if (ray.dx * ray.dx + ray.dy * ray.dy + ray.dz * ray.dz < 1e-14f) return null
        var nearest = Float.POSITIVE_INFINITY
        var winner: Part? = null
        var px = 0f
        var py = 0f
        var pz = 0f
        for (part in parts) {
            if (part.material !in visible || !boxMayHit(ray, part.bounds, nearest)) continue
            val hit = part.tree.nearest(ray, nearest)
            if (hit != null) {
                nearest = hit
                winner = part
                px = ray.ox + ray.dx * hit
                py = ray.oy + ray.dy * hit
                pz = ray.oz + ray.dz * hit
            }
        }
        val part = winner ?: return null
        if (part.material != selectedMaterial) return null
        val group = parts.filter { it.material == selectedMaterial }
        val min = FloatArray(3) { Float.POSITIVE_INFINITY }
        val max = FloatArray(3) { Float.NEGATIVE_INFINITY }
        for (p in group) for (axis in 0..2) {
            min[axis] = minOf(min[axis], p.bounds[axis])
            max[axis] = maxOf(max[axis], p.bounds[axis + 3])
        }
        fun center(v: Float, axis: Int): Int {
            val range = max[axis] - min[axis]
            return if (range < 1e-7f) 50
            else ((v - min[axis]) / range * 100f).roundToInt().coerceIn(0, 100)
        }
        return SurfaceHit(selectedMaterial, px, py, pz, nearest,
            BrushTarget(center(px, 0), center(py, 1), center(pz, 2)))
    }

    private fun boxMayHit(ray: SurfaceRay, box: FloatArray, closest: Float): Boolean {
        var enter = 0f
        var leave = closest
        for (axis in 0..2) {
            val o = when (axis) { 0 -> ray.ox; 1 -> ray.oy; else -> ray.oz }
            val d = when (axis) { 0 -> ray.dx; 1 -> ray.dy; else -> ray.dz }
            val lo = box[axis]
            val hi = box[axis + 3]
            if (abs(d) < 1e-12f) {
                if (o < lo || o > hi) return false
                continue
            }
            var t0 = (lo - o) / d
            var t1 = (hi - o) / d
            if (t0 > t1) { val tmp = t0; t0 = t1; t1 = tmp }
            enter = maxOf(enter, t0)
            leave = minOf(leave, t1)
            if (enter > leave) return false
        }
        return true
    }

    companion object {
        fun fromFile(file: File): GlbSurfacePicker {
            if (!file.isFile || file.length() > GlbHeader.MAX_BYTES)
                throw IOException("Недоступный файл GLB.")
            return fromBytes(file.readBytes())
        }

        fun fromBytes(glb: ByteArray): GlbSurfacePicker {
            if (glb.size < 28) throw IOException("GLB слишком короткий.")
            GlbValidation.error(glb.copyOfRange(0, 20), glb.size.toLong())
                ?.let { throw IOException(it) }
            val input = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN)
            val jsonLength = input.getInt(12)
            val binStart = 28L + jsonLength
            if (binStart > glb.size || input.getInt((binStart - 4).toInt()) != 0x004E4942)
                throw IOException("Нет BIN-чанка.")
            val binSize = input.getInt((binStart - 8).toInt())
            if (binSize < 0 || binStart + binSize != glb.size.toLong())
                throw IOException("Некорректная длина BIN.")
            val doc = try {
                JSONObject(String(glb, 20, jsonLength, Charsets.UTF_8).trimEnd(' ', '\u0000'))
            } catch (_: Exception) { throw IOException("Повреждён JSON GLB.") }
            val scenes = doc.optJSONArray("scenes") ?: throw IOException("Нет сцен.")
            val nodes = doc.optJSONArray("nodes") ?: throw IOException("Нет узлов.")
            val meshes = doc.optJSONArray("meshes") ?: throw IOException("Нет мешей.")
            if (scenes.length() != 1 || nodes.length() != 1)
                throw IOException("Точная кисть требует один узел и одну сцену.")
            val node = nodes.optJSONObject(0) ?: throw IOException("Некорректный узел.")
            val roots = scenes.getJSONObject(0).optJSONArray("nodes")
            if (roots == null || roots.length() != 1 || roots.optInt(0) != 0 ||
                node.has("matrix") || node.has("translation") ||
                node.has("scale") || node.has("rotation") || node.has("children") ||
                node.has("skin"))
                throw IOException("Для точной кисти нужна исходная сцена без преобразований.")
            val meshId = node.optInt("mesh", -1)
            if (meshId !in 0 until meshes.length()) throw IOException("Некорректный меш.")
            val accessors = doc.optJSONArray("accessors") ?: throw IOException("Нет accessors.")
            val views = doc.optJSONArray("bufferViews") ?: throw IOException("Нет bufferViews.")
            val primitives = meshes.getJSONObject(meshId).optJSONArray("primitives")
                ?: throw IOException("Нет примитивов.")
            val parts = ArrayList<Part>(primitives.length())
            var totalTriangles = 0L
            fun readView(accessorId: Int, componentSize: Int, count: Int): Pair<Long, Int> {
                if (accessorId !in 0 until accessors.length())
                    throw IOException("Некорректный accessor.")
                val accessor = accessors.getJSONObject(accessorId)
                if (accessor.has("sparse") || accessor.optInt("count") != count)
                    throw IOException("Неподдерживаемый accessor.")
                val viewId = accessor.optInt("bufferView", -1)
                if (viewId !in 0 until views.length()) throw IOException("Нет bufferView.")
                val view = views.getJSONObject(viewId)
                if (view.optInt("buffer", -1) != 0) throw IOException("Буфер не встроен в GLB.")
                val stride = view.optInt("byteStride", componentSize)
                val start = view.optLong("byteOffset", 0) + accessor.optLong("byteOffset", 0)
                val end = start + (count.toLong() - 1) * stride + componentSize
                if (stride < componentSize || stride % 4 != 0 && componentSize == 12 ||
                    start < 0 || end > binSize.toLong() ||
                    end > view.optLong("byteOffset", 0) + view.getLong("byteLength"))
                    throw IOException("Атрибут выходит за пределы GLB.")
                return start to stride
            }
            for (i in 0 until primitives.length()) {
                val primitive = primitives.optJSONObject(i) ?: continue
                if (primitive.optInt("mode", 4) != 4 || primitive.has("targets"))
                    throw IOException("Для точной кисти нужны TRIANGLES без morph targets.")
                val positionId = primitive.optJSONObject("attributes")?.optInt("POSITION", -1) ?: -1
                if (positionId !in 0 until accessors.length())
                    throw IOException("Нет атрибута POSITION.")
                val pos = accessors.getJSONObject(positionId)
                if (pos.optInt("componentType") != 5126 || pos.optString("type") != "VEC3")
                    throw IOException("Для точной кисти нужны FLOAT VEC3 координаты.")
                val count = pos.optInt("count", -1)
                if (count !in 3..1_000_000) throw IOException("Слишком много или мало вершин.")
                val (start, stride) = readView(positionId, 12, count)
                val vertices = FloatArray(count * 3)
                val bounds = floatArrayOf(
                    Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY,
                    Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY)
                for (v in 0 until count) for (axis in 0..2) {
                    val coord = input.getFloat((binStart + start + v.toLong() * stride + axis * 4).toInt())
                    if (!coord.isFinite()) throw IOException("NaN в координатах.")
                    vertices[v * 3 + axis] = coord
                    bounds[axis] = minOf(bounds[axis], coord)
                    bounds[axis + 3] = maxOf(bounds[axis + 3], coord)
                }
                val indices = if (primitive.has("indices")) {
                    val idxId = primitive.optInt("indices", -1)
                    if (idxId !in 0 until accessors.length()) throw IOException("Неверные индексы.")
                    val acc = accessors.getJSONObject(idxId)
                    if (acc.optString("type") != "SCALAR") throw IOException("Нужны SCALAR индексы.")
                    val size = when (acc.optInt("componentType")) {
                        5121 -> 1
                        5123 -> 2
                        5125 -> 4
                        else -> throw IOException("Неподдерживаемые индексы.")
                    }
                    val idxCount = acc.optInt("count", -1)
                    if (idxCount <= 0 || idxCount % 3 != 0 || idxCount > 6_000_000)
                        throw IOException("Некорректное число индексов.")
                    val (idxStart, idxStride) = readView(idxId, size, idxCount)
                    IntArray(idxCount) { n ->
                        val off = (binStart + idxStart + n.toLong() * idxStride).toInt()
                        val v = when (size) {
                            1 -> input.get(off).toInt() and 255
                            2 -> input.getShort(off).toInt() and 65535
                            else -> (input.getInt(off).toLong() and 0xffffffffL).let {
                                if (it > Int.MAX_VALUE) -1 else it.toInt()
                            }
                        }
                        if (v !in 0 until count) throw IOException("Индекс вершины вне POSITION.")
                        v
                    }
                } else {
                    if (count % 3 != 0) throw IOException("Число вершин не кратно 3.")
                    IntArray(count) { it }
                }
                totalTriangles += indices.size / 3
                if (totalTriangles > 2_000_000L) throw IOException("Слишком большая сетка для точной кисти.")
                parts.add(Part(primitive.optInt("material", -1), vertices, indices, bounds))
            }
            if (parts.isEmpty()) throw IOException("Меш пуст.")
            return GlbSurfacePicker(parts)
        }
    }
}
