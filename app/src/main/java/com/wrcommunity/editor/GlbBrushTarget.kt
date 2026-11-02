package com.wrcommunity.editor

import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToInt

/**
 * Coordinates of a tap projected onto the model collision shape are only an
 * *approximation* of the surface. Material selection is explicit in the UI.
 * This maps that coordinate to the existing local-sculpt 0..100 controls.
 */
data class BrushTarget(val x: Int, val y: Int, val z: Int)

data class BrushMaterialBounds(
    val material: Int,
    val min: List<Float>,
    val max: List<Float>
) {
    fun at(x: Float, y: Float, z: Float): BrushTarget? {
        val coords = listOf(x, y, z)
        if (coords.any { !it.isFinite() }) return null
        val values = coords.indices.map { axis ->
            val width = max[axis] - min[axis]
            if (width <= 1e-7f) 50 else
                ((coords[axis] - min[axis]) * 100 / width)
                    .roundToInt().coerceIn(0, 100)
        }
        return BrushTarget(values[0], values[1], values[2])
    }
}

object GlbBrushTarget {
    fun fromFile(file: File): Map<Int, BrushMaterialBounds> {
        if (!file.isFile || file.length() > GlbHeader.MAX_BYTES)
            throw IOException("GLB для выбора точки недоступен.")
        return inspect(file.readBytes())
    }

    fun inspect(glb: ByteArray): Map<Int, BrushMaterialBounds> {
        if (glb.size < 20) throw IOException("GLB повреждён.")
        GlbValidation.error(glb.copyOfRange(0, 20), glb.size.toLong())
            ?.let { throw IOException(it) }
        val jsonLength = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val root = try {
            JSONObject(String(glb, 20, jsonLength, Charsets.UTF_8).trimEnd(' ', '\u0000'))
        } catch (_: Exception) {
            throw IOException("Неверный glTF JSON.")
        }

        // Original-local points are only meaningful when mesh nodes have no
        // intermediate transforms. Complex scenes retain manual placement.
        val nodes = root.optJSONArray("nodes") ?: return emptyMap()
        val scenes = root.optJSONArray("scenes") ?: return emptyMap()
        if (scenes.length() != 1 || nodes.length() != 1) return emptyMap()
        val node = nodes.optJSONObject(0) ?: return emptyMap()
        if (node.has("matrix") || node.has("translation") ||
            node.has("rotation") || node.has("scale") || node.has("skin") ||
            node.has("children")) return emptyMap()
        val meshIndex = node.optInt("mesh", -1)
        val meshes = root.optJSONArray("meshes") ?: return emptyMap()
        if (meshIndex !in 0 until meshes.length()) return emptyMap()
        val primitives = meshes.optJSONObject(meshIndex)?.optJSONArray("primitives")
            ?: return emptyMap()
        val accessors = root.optJSONArray("accessors") ?: return emptyMap()
        val collected = linkedMapOf<Int, Pair<FloatArray, FloatArray>>()
        for (i in 0 until primitives.length()) {
            val part = primitives.optJSONObject(i) ?: continue
            val posId = part.optJSONObject("attributes")?.optInt("POSITION", -1) ?: -1
            if (posId !in 0 until accessors.length()) continue
            val accessor = accessors.optJSONObject(posId) ?: continue
            if (accessor.optString("type") != "VEC3") continue
            val lo = accessor.optJSONArray("min") ?: continue
            val hi = accessor.optJSONArray("max") ?: continue
            if (lo.length() != 3 || hi.length() != 3) continue
            val values = try {
                Pair(FloatArray(3) { lo.getDouble(it).toFloat() },
                    FloatArray(3) { hi.getDouble(it).toFloat() })
            } catch (_: Exception) { continue }
            if ((0..2).any { !values.first[it].isFinite() ||
                !values.second[it].isFinite() ||
                values.first[it] > values.second[it] }) continue
            val material = part.optInt("material", -1)
            val old = collected[material]
            if (old == null) collected[material] = values
            else for (j in 0..2) {
                old.first[j] = minOf(old.first[j], values.first[j])
                old.second[j] = maxOf(old.second[j], values.second[j])
            }
        }
        return collected.mapValues { (id, v) ->
            BrushMaterialBounds(id, v.first.toList(), v.second.toList())
        }
    }
}
