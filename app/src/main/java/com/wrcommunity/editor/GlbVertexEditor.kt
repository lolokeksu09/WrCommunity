package com.wrcommunity.editor

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.io.ByteArrayOutputStream
import kotlin.math.min
import kotlin.math.max

/** One offset in local mesh units, applied to one vertex of one mesh primitive. */
data class VertexMove(
    val mesh: Int,
    val primitive: Int,
    val vertex: Int,
    val dx: Float,
    val dy: Float,
    val dz: Float
) {
    fun check() {
        if (mesh !in 0..100000 || primitive !in 0..100000 ||
            vertex !in 0..1000000 ||
            listOf(dx,dy,dz).any { !it.isFinite() || it !in -3f..3f } ||
            dx == 0f && dy == 0f && dz == 0f)
            throw IOException("Недопустимое смещение вершины.")
    }
}

/** A vertex nudge is an independent undo step; redo branches are discarded on edit. */
data class VertexHistory(
    val states: List<List<VertexMove>> = listOf(emptyList()),
    val index: Int = 0
) {
    val current: List<VertexMove> get() = states[index]
    val canUndo: Boolean get() = index > 0
    val canRedo: Boolean get() = index < states.lastIndex
    fun add(move: VertexMove): VertexHistory = addGroup(listOf(move))

    /** All changed vertices form one Undo/Redo transaction. */
    fun addGroup(moves: List<VertexMove>): VertexHistory {
        if (moves.isEmpty()) throw IOException("Группа вершин пуста.")
        if (current.size + moves.size > 64)
            throw IOException("Лимит 64 правки вершин. Уменьши выделение или сохрани GLB.")
        moves.forEach { it.check() }
        val first = moves.first()
        if (moves.any { it.mesh != first.mesh || it.primitive != first.primitive } ||
            moves.map { it.vertex }.toSet().size != moves.size)
            throw IOException("В одной операции нужны разные вершины одного примитива.")
        val next = states.take(index+1).takeLast(49) + listOf(current + moves)
        return VertexHistory(next, next.lastIndex)
    }
    fun undo() = if (canUndo) copy(index=index-1) else this
    fun redo() = if (canRedo) copy(index=index+1) else this
    fun reset(): VertexHistory {
        if (current.isEmpty()) return this
        val next = states.take(index+1).takeLast(49) + listOf(emptyList<VertexMove>())
        return VertexHistory(next, next.lastIndex)
    }
}

data class VertexPrimitive(
    val mesh: Int,
    val primitive: Int,
    val materialId: Int,
    val vertices: Int
)

/**
 * Precise, non-destructive POSITION editing.
 *
 * Never overwrites an original/shared accessor: each edited primitive receives
 * its own FLOAT VEC3 bufferView and accessor. NORMAL is rebuilt through the
 * existing normal pipeline (when present). Mesh topology remains unchanged.
 */
object GlbVertexEditor {
    private const val MAX_JSON = 16 * 1024 * 1024
    private const val FLOAT_VEC3 = 5126

    private fun jsonFrom(data: ByteArray): Pair<JSONObject, Int> {
        if (data.size < 28 || data.size > GlbHeader.MAX_BYTES)
            throw IOException("GLB для правки вершин недоступен.")
        GlbValidation.error(data.copyOfRange(0,20), data.size.toLong())
            ?.let { throw IOException(it) }
        val n = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        if (n !in 2..MAX_JSON || n.toLong()+28L > data.size)
            throw IOException("Описание GLB повреждено или слишком велико.")
        val root = try {
            JSONObject(String(data,20,n,Charsets.UTF_8).trimEnd(' ', '\u0000'))
        } catch (_: Exception) { throw IOException("Повреждён JSON GLB.") }
        return root to n
    }

    /** Read only the JSON chunk to populate the mesh/primitive/vertex selector. */
    fun targets(file: File): List<VertexPrimitive> {
        if (!file.isFile || file.length() !in 28..GlbHeader.MAX_BYTES)
            throw IOException("Исходный GLB недоступен.")
        val header = ByteArray(20)
        val json: ByteArray
        FileInputStream(file).use { input ->
            if (input.read(header) != 20)
                throw IOException("GLB повреждён.")
            GlbValidation.error(header, file.length())?.let { throw IOException(it) }
            val n = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
            if (n !in 2..MAX_JSON || n.toLong()+28L > file.length())
                throw IOException("Неверный размер JSON GLB.")
            json = ByteArray(n)
            var at = 0
            while (at < n) {
                val count = input.read(json, at, n-at)
                if (count < 0) throw IOException("Неожиданный конец JSON GLB.")
                at += count
            }
        }
        val root = try {
            JSONObject(String(json,Charsets.UTF_8).trimEnd(' ', '\u0000'))
        } catch (_: Exception) { throw IOException("Повреждён JSON GLB.") }
        return available(root)
    }

    private fun available(root: JSONObject): List<VertexPrimitive> {
        val meshes = root.optJSONArray("meshes") ?: return emptyList()
        val accessors = root.optJSONArray("accessors") ?: return emptyList()
        val targets = ArrayList<VertexPrimitive>()
        for (m in 0 until meshes.length()) {
            val prims = meshes.optJSONObject(m)?.optJSONArray("primitives") ?: continue
            for (p in 0 until prims.length()) {
                val obj = prims.optJSONObject(p) ?: continue
                if (obj.optInt("mode",4) != 4 || obj.has("targets")) continue
                val id = obj.optJSONObject("attributes")?.optInt("POSITION",-1) ?: -1
                val a = accessors.optJSONObject(id) ?: continue
                val count = a.optInt("count",-1)
                if (count !in 1..1000000 || a.optString("type") != "VEC3" ||
                    a.optInt("componentType") != FLOAT_VEC3 || a.has("sparse") ||
                    a.optBoolean("normalized",false)) continue
                targets.add(VertexPrimitive(m,p,obj.optInt("material",-1),count))
            }
        }
        return targets
    }

    fun apply(glb: ByteArray, moves: List<VertexMove>): ByteArray {
        if (moves.isEmpty()) return glb.copyOf()
        if (moves.size > 64) throw IOException("Лимит 64 правки вершин.")
        moves.forEach { it.check() }
        val (root, n) = jsonFrom(glb)
        if (root.optJSONObject("asset")?.optString("version") != "2.0" ||
            (root.optJSONArray("skins")?.length() ?: 0) > 0 ||
            (root.optJSONArray("animations")?.length() ?: 0) > 0)
            throw IOException("Правка вершин поддерживает только статическую модель glTF 2.0.")
        val input = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN)
        val binStart = 28L+n
        if (binStart > glb.size || binStart-8 > Int.MAX_VALUE)
            throw IOException("BIN отсутствует.")
        val binSize = input.getInt((binStart-8).toInt())
        if (binSize < 0 || input.getInt((binStart-4).toInt()) != 0x004E4942 ||
            binStart+binSize.toLong() != glb.size.toLong())
            throw IOException("Поддерживается один BIN chunk.")
        val buffers = root.optJSONArray("buffers") ?: throw IOException("Нет buffer.")
        if (buffers.length() != 1) throw IOException("Поддерживается один buffer.")
        val buffer = buffers.getJSONObject(0)
        if (buffer.has("uri")) throw IOException("Внешний buffer не поддерживается.")
        val declared = buffer.optLong("byteLength",-1)
        if (declared < binSize-3L || declared > binSize.toLong())
            throw IOException("Размер бинарного буфера неверен.")
        val meshes = root.optJSONArray("meshes") ?: throw IOException("Нет meshes.")
        val accessors = root.optJSONArray("accessors") ?: throw IOException("Нет accessors.")
        val views = root.optJSONArray("bufferViews") ?: throw IOException("Нет bufferViews.")
        if ((0 until meshes.length()).any { meshes.optJSONObject(it)?.has("weights") == true })
            throw IOException("Morph targets не поддерживаются.")

        val addition = ByteArrayOutputStream()
        val groups = moves.groupBy { it.mesh to it.primitive }
        for ((identity, changes) in groups) {
            val (m,p) = identity
            val mesh = meshes.optJSONObject(m) ?: throw IOException("Неизвестный mesh.")
            val primitive = mesh.optJSONArray("primitives")?.optJSONObject(p)
                ?: throw IOException("Неизвестный primitive.")
            if (primitive.optInt("mode",4) != 4 || primitive.has("targets"))
                throw IOException("Для правки вершин нужны TRIANGLES без morph targets.")
            val attrs = primitive.optJSONObject("attributes")
                ?: throw IOException("Нет атрибутов вершин.")
            val posId = attrs.optInt("POSITION",-1)
            val acc = accessors.optJSONObject(posId)
                ?: throw IOException("Отсутствует POSITION.")
            if (acc.optString("type") != "VEC3" ||
                acc.optInt("componentType") != FLOAT_VEC3 ||
                acc.has("sparse") || acc.optBoolean("normalized",false))
                throw IOException("Нужен POSITION FLOAT VEC3.")
            val count = acc.optInt("count",-1)
            if (count !in 1..1000000)
                throw IOException("Число вершин недопустимо.")
            if (changes.any { it.vertex !in 0 until count })
                throw IOException("Индекс вершины за границами примитива.")
            val view = views.optJSONObject(acc.optInt("bufferView",-1))
                ?: throw IOException("Нет POSITION bufferView.")
            if (view.optInt("buffer",-1) != 0) throw IOException("POSITION вне BIN.")
            val stride = view.optInt("byteStride",12)
            val viewStart = view.optLong("byteOffset",0L)
            val viewLength = view.optLong("byteLength",-1L)
            val base = viewStart+acc.optLong("byteOffset",0L)
            val end = base+(count.toLong()-1)*stride+12
            if (stride < 12 || stride % 4 != 0 || base < 0 ||
                end > viewStart+viewLength || end > declared ||
                end+binStart > glb.size)
                throw IOException("POSITION вне границ GLB.")

            val original = FloatArray(count*3)
            for (v in 0 until count) for (axis in 0..2) {
                val offset = (binStart+base+v.toLong()*stride+axis*4).toInt()
                val value = input.getFloat(offset)
                if (!value.isFinite()) throw IOException("Повреждены исходные вершины.")
                original[v*3+axis] = value
            }
            val changed = original.copyOf()
            for (move in changes) {
                val i = move.vertex*3
                changed[i] += move.dx
                changed[i+1] += move.dy
                changed[i+2] += move.dz
                if (!(changed[i].isFinite() && changed[i+1].isFinite() &&
                        changed[i+2].isFinite()))
                    throw IOException("Перемещение вершины превысило допустимый диапазон.")
            }
            val low = FloatArray(3){Float.POSITIVE_INFINITY}
            val high = FloatArray(3){Float.NEGATIVE_INFINITY}
            val packed = ByteBuffer.allocate(count*12).order(ByteOrder.LITTLE_ENDIAN)
            for (v in 0 until count) for (axis in 0..2) {
                val value = changed[v*3+axis]
                low[axis] = min(low[axis], value)
                high[axis] = max(high[axis], value)
                packed.putFloat(value)
            }
            while ((binSize+addition.size())%4 != 0) addition.write(0)
            val at = binSize+addition.size()
            val data = packed.array()
            addition.write(data)
            val nextView = views.length()
            views.put(JSONObject().put("buffer",0).put("byteOffset",at)
                .put("byteLength",data.size).put("target",34962))
            val nextAccessor = accessors.length()
            val cloned = JSONObject(acc.toString()).put("bufferView",nextView)
                .put("byteOffset",0)
                .put("min",JSONArray().put(low[0].toDouble()).put(low[1].toDouble()).put(low[2].toDouble()))
                .put("max",JSONArray().put(high[0].toDouble()).put(high[1].toDouble()).put(high[2].toDouble()))
            accessors.put(cloned)
            attrs.put("POSITION",nextAccessor)

            // Rebuild only this primitive's NORMAL; keep shared originals intact.
            GlbNormals.rebuild(input,binStart,declared,primitive,attrs,accessors,
                views,changed,original,addition,binSize)
        }
        val bin = ByteArrayOutputStream()
        bin.write(glb,binStart.toInt(),binSize)
        bin.write(addition.toByteArray())
        buffer.put("byteLength",bin.size())
        while (bin.size()%4 != 0) bin.write(0)
        val json = root.toString().toByteArray(Charsets.UTF_8)
        val padded = ((json.size+3L) and -4L).toInt()
        val outSize = 20L+padded+8L+bin.size()
        if (outSize > GlbHeader.MAX_BYTES || outSize > Int.MAX_VALUE)
            throw IOException("Результат превышает лимит 150 МБ.")
        val out = ByteBuffer.allocate(outSize.toInt()).order(ByteOrder.LITTLE_ENDIAN)
        out.putInt(0x46546C67).putInt(2).putInt(outSize.toInt())
        out.putInt(padded).putInt(0x4E4F534A).put(json)
        repeat(padded-json.size){out.put(32.toByte())}
        out.putInt(bin.size()).putInt(0x004E4942).put(bin.toByteArray())
        return out.array()
    }
}
