package com.wrcommunity.editor

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Non-destructive, material-group transforms using glTF nodes.
 *
 * A material group is a collection of primitives, not a selectable face region.
 * All original bufferViews, accessors, materials and textures remain untouched.
 */
data class PartEdit(
    val x: Float = 0f,
    val y: Float = 0f,
    val z: Float = 0f,
    val rotationY: Int = 0,
    val scalePercent: Int = 100
) {
    val isIdentity: Boolean get() =
        x == 0f && y == 0f && z == 0f && rotationY == 0 && scalePercent == 100

    fun check() {
        if (!x.isFinite() || !y.isFinite() || !z.isFinite() ||
            x !in -3f..3f || y !in -3f..3f || z !in -3f..3f ||
            rotationY !in -360..360 || scalePercent !in 25..300
        ) throw IOException("Недопустимое преобразование части модели.")
    }
}

data class PartHistory(
    val steps: List<Map<Int, PartEdit>> = listOf(emptyMap()),
    val index: Int = 0
) {
    val current: Map<Int, PartEdit> get() = steps[index]
    val canUndo: Boolean get() = index > 0
    val canRedo: Boolean get() = index < steps.lastIndex

    fun change(id: Int, edit: PartEdit): PartHistory {
        edit.check()
        val next = current.toMutableMap()
        if (edit.isIdentity) next.remove(id) else next[id] = edit
        if (next == current) return this
        val branch = steps.take(index + 1).takeLast(49) + mapOf<Int, PartEdit>().let { next.toMap() }
        return PartHistory(branch, branch.lastIndex)
    }
    fun reset(): PartHistory = if (current.isEmpty()) this else changeAll(emptyMap())
    fun changeAll(next: Map<Int, PartEdit>): PartHistory {
        if (next == current) return this
        val branch = steps.take(index + 1).takeLast(49) + next.toMap()
        return PartHistory(branch, branch.lastIndex)
    }
    fun undo() = if (canUndo) copy(index = index - 1) else this
    fun redo() = if (canRedo) copy(index = index + 1) else this
}

object GlbPartTransforms {
    /**
     * Groups each mesh's triangles by material ID, then adds child nodes holding
     * the original primitives with edited TRS. This is an actual scene transform,
     * persisted in exported GLB and understood by Blender/Filament.
     */
    fun apply(original: ByteArray, changes: Map<Int, PartEdit>): ByteArray {
        val active = changes.filterValues { !it.isIdentity }
        if (active.isEmpty()) return original.copyOf()
        active.values.forEach { it.check() }
        if (original.size < 20 || original.size > GlbHeader.MAX_BYTES)
            throw IOException("Размер GLB недопустим.")
        GlbValidation.error(original.copyOfRange(0, 20), original.size.toLong())
            ?.let { throw IOException(it) }

        val jsonSize = ByteBuffer.wrap(original).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val root = try {
            JSONObject(String(original, 20, jsonSize, Charsets.UTF_8).trimEnd(' ', '\u0000'))
        } catch (_: Exception) {
            throw IOException("Повреждённый JSON GLB.")
        }

        val nodes = root.optJSONArray("nodes") ?: throw IOException("В GLB нет узлов.")
        val meshes = root.optJSONArray("meshes") ?: throw IOException("В GLB нет сеток.")
        val originalNodeCount = nodes.length()
        val originalMeshCount = meshes.length()
        var changedNodes = 0

        // glTF skin and morph animation require skin-aware editing, which isn't yet
        // implemented. Refuse safely, rather than exporting silently broken assets.
        if ((root.optJSONArray("animations")?.length() ?: 0) > 0 ||
            (root.optJSONArray("skins")?.length() ?: 0) > 0) {
            throw IOException("Правка частей пока не поддерживает анимации и скелет.")
        }
        for (mi in 0 until originalMeshCount) {
            val mesh = meshes.optJSONObject(mi) ?: continue
            if (mesh.has("weights")) throw IOException("Morph targets пока не поддерживаются.")
            val primitives = mesh.optJSONArray("primitives") ?: continue
            for (pi in 0 until primitives.length()) {
                if (primitives.optJSONObject(pi)?.has("targets") == true)
                    throw IOException("Morph targets пока не поддерживаются.")
            }
        }

        for (ni in 0 until originalNodeCount) {
            val node = nodes.optJSONObject(ni) ?: continue
            if (!node.has("mesh")) continue
            if (node.has("skin")) throw IOException("Правка частей со скелетом пока недоступна.")
            val meshIndex = node.optInt("mesh", -1)
            if (meshIndex !in 0 until originalMeshCount)
                throw IOException("Некорректная ссылка на mesh.")
            val mesh = meshes.optJSONObject(meshIndex) ?: continue
            val primitives = mesh.optJSONArray("primitives") ?: continue
            val groups = linkedMapOf<Int, JSONArray>()
            for (pi in 0 until primitives.length()) {
                val primitive = primitives.optJSONObject(pi) ?: continue
                val material = primitive.optInt("material", -1)
                groups.getOrPut(material) { JSONArray() }.put(primitive)
            }
            if (groups.keys.none { it in active }) continue

            val childIds = node.optJSONArray("children")?.let { JSONArray(it.toString()) } ?: JSONArray()
            for ((materialId, groupPrimitives) in groups) {
                val meshClone = JSONObject(mesh.toString())
                meshClone.put("primitives", groupPrimitives)
                meshClone.put("name", "Part material ${materialId}")
                val newMeshIndex = meshes.length()
                meshes.put(meshClone)

                val groupNode = JSONObject()
                    .put("name", "3D Editor part ${materialId}")
                    .put("mesh", newMeshIndex)
                active[materialId]?.let { edit ->
                    groupNode.put("translation", JSONArray().put(edit.x.toDouble())
                        .put(edit.y.toDouble()).put(edit.z.toDouble()))
                    val q = ModelEdit(y = edit.rotationY).quaternion()
                    groupNode.put("rotation", JSONArray().put(q[0].toDouble())
                        .put(q[1].toDouble()).put(q[2].toDouble()).put(q[3].toDouble()))
                    val k = edit.scalePercent / 100.0
                    groupNode.put("scale", JSONArray().put(k).put(k).put(k))
                }
                val childIndex = nodes.length()
                nodes.put(groupNode)
                childIds.put(childIndex)
            }
            node.remove("mesh")
            node.put("children", childIds)
            changedNodes++
        }
        if (changedNodes == 0)
            throw IOException("Выбранные материалы не используются в модели.")
        return GlbLayers.rewriteJson(original, root)
    }
}
