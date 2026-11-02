package com.wrcommunity.editor

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.pow

data class SculptStroke(
    val materialId: Int,
    val centerX: Int = 50,
    val centerY: Int = 50,
    val centerZ: Int = 50,
    val radius: Int = 30,
    val axis: Int = 2, // +/-1 X, +/-2 Y, +/-3 Z
    val strength: Int = 4
) {
    fun check() {
        if (centerX !in 0..100 || centerY !in 0..100 || centerZ !in 0..100 ||
            radius !in 5..100 || axis !in listOf(-3,-2,-1,1,2,3) ||
            strength !in 1..20) throw IOException("Неверные параметры деформации.")
    }
}

data class SculptHistory(val states: List<List<SculptStroke>> = listOf(emptyList()), val index: Int = 0) {
    val current get() = states[index]
    val canUndo get() = index > 0
    val canRedo get() = index < states.lastIndex
    fun add(stroke: SculptStroke): SculptHistory {
        stroke.check()
        if (current.size >= 20) throw IOException("Лимит 20 деформаций; сохрани GLB.")
        val branch = states.take(index + 1).takeLast(49) + listOf(current + stroke)
        return SculptHistory(branch, branch.lastIndex)
    }
    fun undo() = if (canUndo) copy(index = index - 1) else this
    fun redo() = if (canRedo) copy(index = index + 1) else this
    fun reset(): SculptHistory {
        if (current.isEmpty()) return this
        val branch = states.take(index + 1).takeLast(49) + listOf(emptyList<SculptStroke>())
        return SculptHistory(branch, branch.lastIndex)
    }
}

/** Safe CPU deformation of POSITION. New accessors never mutate shared vertex data. */
object GlbSculpt {
    fun apply(glb: ByteArray, strokes: List<SculptStroke>): ByteArray {
        if (strokes.isEmpty()) return glb.copyOf()
        if (strokes.size > 20) throw IOException("Лимит 20 деформаций.")
        strokes.forEach { it.check() }
        if (glb.size < 28 || glb.size > GlbHeader.MAX_BYTES) throw IOException("Размер GLB недопустим.")
        GlbValidation.error(glb.copyOfRange(0,20), glb.size.toLong())
            ?.let { throw IOException(it) }
        val input = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN)
        val jsonLength = input.getInt(12)
        val binStart = 20L + jsonLength + 8L
        if (binStart > glb.size) throw IOException("BIN отсутствует.")
        val originalBinSize = input.getInt((binStart - 8).toInt())
        if (originalBinSize < 0 || input.getInt((binStart - 4).toInt()) != 0x004E4942 ||
            binStart + originalBinSize.toLong() != glb.size.toLong())
            throw IOException("Нужен один бинарный GLB chunk.")
        val root = try {
            JSONObject(String(glb,20,jsonLength,Charsets.UTF_8).trimEnd(' ', '\u0000'))
        } catch (_: Exception) { throw IOException("Повреждён JSON GLB.") }
        if ((root.optJSONArray("skins")?.length() ?: 0) > 0 ||
            (root.optJSONArray("animations")?.length() ?: 0) > 0)
            throw IOException("Анимации и скелет пока не поддерживаются.")
        val buffers = root.optJSONArray("buffers") ?: throw IOException("Нет buffers.")
        if (buffers.length() != 1) throw IOException("Поддерживается один buffer.")
        val buffer = buffers.getJSONObject(0)
        if (buffer.has("uri")) throw IOException("Внешние ресурсы недоступны.")
        val declared = buffer.getLong("byteLength")
        if (declared > originalBinSize || declared < originalBinSize - 3)
            throw IOException("Размер бинарного буфера неверен.")
        val meshes = root.optJSONArray("meshes") ?: throw IOException("Нет meshes.")
        val accessors = root.optJSONArray("accessors") ?: throw IOException("Нет accessors.")
        val views = root.optJSONArray("bufferViews") ?: throw IOException("Нет bufferViews.")
        val byMaterial = strokes.groupBy { it.materialId }

        // For materials split into several primitives, the picker works in
        // the material's combined bounding box. Match that coordinate system
        // when applying strokes instead of shifting each primitive separately.
        val groupBounds = mutableMapOf<Int, Pair<FloatArray, FloatArray>>()
        val unavailable = mutableSetOf<Int>()
        for (mi in 0 until meshes.length()) {
            val prims = meshes.optJSONObject(mi)?.optJSONArray("primitives") ?: continue
            for (pi in 0 until prims.length()) {
                val primitive = prims.optJSONObject(pi) ?: continue
                val material = primitive.optInt("material", -1)
                if (material !in byMaterial) continue
                val id = primitive.optJSONObject("attributes")?.optInt("POSITION", -1) ?: -1
                val acc = accessors.optJSONObject(id)
                val lower = acc?.optJSONArray("min")
                val upper = acc?.optJSONArray("max")
                if (lower == null || upper == null ||
                    lower.length() != 3 || upper.length() != 3) {
                    unavailable.add(material)
                    continue
                }
                val lowerValues = FloatArray(3) { lower.optDouble(it, Double.NaN).toFloat() }
                val upperValues = FloatArray(3) { upper.optDouble(it, Double.NaN).toFloat() }
                if ((0..2).any { !lowerValues[it].isFinite() ||
                    !upperValues[it].isFinite() ||
                    lowerValues[it] > upperValues[it] }) {
                    unavailable.add(material)
                    continue
                }
                val current = groupBounds[material]
                if (current == null) groupBounds[material] = lowerValues to upperValues
                else for (axis in 0..2) {
                    current.first[axis] = minOf(current.first[axis], lowerValues[axis])
                    current.second[axis] = maxOf(current.second[axis], upperValues[axis])
                }
            }
        }
        unavailable.forEach { groupBounds.remove(it) }
        val append = java.io.ByteArrayOutputStream()
        val cloned = mutableMapOf<Pair<Int,Int>,Int>()
        val deformedPositions = mutableMapOf<Pair<Int,Int>,FloatArray>()
        val originalPositions = mutableMapOf<Pair<Int,Int>,FloatArray>()
        var changed = 0
        for (mi in 0 until meshes.length()) {
            val primitives = meshes.optJSONObject(mi)?.optJSONArray("primitives") ?: continue
            for (pi in 0 until primitives.length()) {
                val primitive = primitives.optJSONObject(pi) ?: continue
                if (primitive.has("targets")) throw IOException("Morph targets не поддерживаются.")
                val mat = primitive.optInt("material",-1)
                val edits = byMaterial[mat] ?: continue
                val attrs = primitive.optJSONObject("attributes") ?: throw IOException("Нет атрибутов.")
                val oldId = attrs.optInt("POSITION",-1)
                if (oldId !in 0 until accessors.length()) throw IOException("Нет POSITION.")
                val key = mat to oldId
                if (cloned.containsKey(key)) {
                    attrs.put("POSITION", cloned.getValue(key))
                    GlbNormals.rebuild(input, binStart, declared, primitive, attrs,
                        accessors, views, deformedPositions.getValue(key),
                        originalPositions.getValue(key), append, originalBinSize)
                    changed++
                    continue
                }
                val acc = accessors.getJSONObject(oldId)
                if (acc.optInt("componentType") != 5126 ||
                    acc.optString("type") != "VEC3" || acc.has("sparse") ||
                    acc.optBoolean("normalized",false))
                    throw IOException("Нужен FLOAT VEC3 без компрессии.")
                val count = acc.optInt("count",-1)
                if (count <= 0 || count > 1000000) throw IOException("Некорректное число вершин.")
                val viewId = acc.optInt("bufferView",-1)
                if (viewId !in 0 until views.length()) throw IOException("Нет bufferView.")
                val view = views.getJSONObject(viewId)
                if (view.optInt("buffer") != 0) throw IOException("Внешний buffer не поддерживается.")
                val stride = view.optInt("byteStride",12)
                val base = view.optLong("byteOffset",0)+acc.optLong("byteOffset",0)
                val end = base + (count.toLong()-1)*stride+12L
                if (stride < 12 || stride%4 != 0 || base < 0 ||
                    end > view.optLong("byteOffset",0)+view.getLong("byteLength") ||
                    end > declared) throw IOException("POSITION вне границ.")
                val vertices = FloatArray(count*3)
                val low = FloatArray(3){Float.POSITIVE_INFINITY}
                val high = FloatArray(3){Float.NEGATIVE_INFINITY}
                for (i in 0 until count) for (axis in 0..2) {
                    val v = input.getFloat((binStart+base+i.toLong()*stride+axis*4).toInt())
                    if (!v.isFinite()) throw IOException("Повреждены вершины.")
                    vertices[i*3+axis] = v
                    low[axis] = kotlin.math.min(low[axis],v)
                    high[axis] = kotlin.math.max(high[axis],v)
                }
                originalPositions[key] = vertices.copyOf()
                val bounds = groupBounds[mat]
                val centerMin = bounds?.first ?: low
                val centerMax = bounds?.second ?: high
                val span = maxOf(centerMax[0]-centerMin[0],
                    centerMax[1]-centerMin[1],centerMax[2]-centerMin[2])
                if (span <= 0f || !span.isFinite()) throw IOException("Нулевой размер сетки.")
                for (stroke in edits) {
                    val cx=centerMin[0]+(centerMax[0]-centerMin[0])*stroke.centerX/100f
                    val cy=centerMin[1]+(centerMax[1]-centerMin[1])*stroke.centerY/100f
                    val cz=centerMin[2]+(centerMax[2]-centerMin[2])*stroke.centerZ/100f
                    val r=span*stroke.radius/100f
                    val d=span*stroke.strength/100f*(if(stroke.axis>0) 1f else -1f)
                    val dest=kotlin.math.abs(stroke.axis)-1
                    for (i in 0 until count) {
                        val off=i*3
                        val dx=vertices[off]-cx
                        val dy=vertices[off+1]-cy
                        val dz=vertices[off+2]-cz
                        val q=(dx*dx+dy*dy+dz*dz)/(r*r)
                        if (q < 1f) vertices[off+dest]+=d*(1f-q).pow(2)
                    }
                }
                val packed=ByteBuffer.allocate(count*12).order(ByteOrder.LITTLE_ENDIAN)
                val min=FloatArray(3){Float.POSITIVE_INFINITY}
                val max=FloatArray(3){Float.NEGATIVE_INFINITY}
                for (i in 0 until count) for (axis in 0..2) {
                    val v=vertices[i*3+axis]
                    packed.putFloat(v)
                    min[axis]=kotlin.math.min(min[axis],v)
                    max[axis]=kotlin.math.max(max[axis],v)
                }
                while ((originalBinSize+append.size())%4 != 0) append.write(0)
                val at=originalBinSize+append.size()
                val bytes=packed.array()
                append.write(bytes)
                val newView=views.length()
                views.put(JSONObject().put("buffer",0).put("byteOffset",at)
                    .put("byteLength",bytes.size).put("target",34962))
                val clone=JSONObject(acc.toString())
                    .put("bufferView",newView).put("byteOffset",0)
                    .put("min",JSONArray().put(min[0].toDouble()).put(min[1].toDouble()).put(min[2].toDouble()))
                    .put("max",JSONArray().put(max[0].toDouble()).put(max[1].toDouble()).put(max[2].toDouble()))
                val newId=accessors.length()
                accessors.put(clone)
                attrs.put("POSITION",newId)
                cloned[key]=newId
                deformedPositions[key]=vertices
                GlbNormals.rebuild(input, binStart, declared, primitive, attrs,
                    accessors, views, vertices, originalPositions.getValue(key),
                    append, originalBinSize)
                changed++
            }
        }
        if (changed == 0) throw IOException("Не найдены вершины выбранного материала.")
        val newBin = java.io.ByteArrayOutputStream()
        newBin.write(glb,binStart.toInt(),originalBinSize)
        newBin.write(append.toByteArray())
        buffer.put("byteLength",newBin.size())
        while (newBin.size()%4 != 0) newBin.write(0)
        val json = root.toString().toByteArray(Charsets.UTF_8)
        val padded=((json.size+3L) and -4L).toInt()
        val newSize=20L+padded+8L+newBin.size()
        if (newSize > GlbHeader.MAX_BYTES || newSize > Int.MAX_VALUE)
            throw IOException("GLB превышает 150 МБ.")
        val out=ByteBuffer.allocate(newSize.toInt()).order(ByteOrder.LITTLE_ENDIAN)
        out.putInt(0x46546C67).putInt(2).putInt(newSize.toInt())
        out.putInt(padded).putInt(0x4E4F534A).put(json)
        repeat(padded-json.size){out.put(32.toByte())}
        out.putInt(newBin.size()).putInt(0x004E4942).put(newBin.toByteArray())
        return out.array()
    }
}
