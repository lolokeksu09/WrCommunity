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

/** Exports a transformed GLB with original vertex data, images and binary chunks unchanged. */
object GlbTransformExporter {
    private const val JSON_CHUNK = 0x4E4F534A
    private const val MAGIC = 0x46546C67

    fun transform(original: ByteArray, edit: ModelEdit): ByteArray {
        if (original.size < 20 || original.size > GlbHeader.MAX_BYTES) {
            throw IOException("Недопустимый размер GLB.")
        }
        GlbValidation.error(original.copyOfRange(0, 20), original.size.toLong())?.let {
            throw IOException(it)
        }
        if (edit.isIdentity) return original.copyOf()
        if (edit.scalePercent !in 10..400) throw IOException("Масштаб должен быть от 10 до 400 %.")
        val input = ByteBuffer.wrap(original).order(ByteOrder.LITTLE_ENDIAN)
        val oldJsonLength = input.getInt(12)
        val document = JSONObject(String(original, 20, oldJsonLength, Charsets.UTF_8).trimEnd(' ', '\u0000'))
        val nodes = document.optJSONArray("nodes") ?: JSONArray().also { document.put("nodes", it) }
        val scenes = document.optJSONArray("scenes") ?: throw IOException("В GLB нет сцен для экспорта.")
        if (scenes.length() == 0) throw IOException("В GLB нет сцен для экспорта.")

        val rotation = edit.quaternion()
        val size = edit.scalePercent / 100f
        for (index in 0 until scenes.length()) {
            val scene = scenes.optJSONObject(index) ?: throw IOException("Некорректная сцена GLB.")
            val roots = scene.optJSONArray("nodes")
                ?: throw IOException("Не найдены корневые узлы сцены.")
            if (roots.length() == 0) throw IOException("У сцены нет корневых узлов.")
            // Preserve original indices and node data. Attach one new parent per scene.
            val children = JSONArray()
            for (i in 0 until roots.length()) {
                val originalRoot = roots.optInt(i, -1)
                if (originalRoot !in 0 until nodes.length()) {
                    throw IOException("Повреждённые связи узлов в GLB.")
                }
                children.put(originalRoot)
            }
            val parent = JSONObject()
                .put("name", "3D Editor transform")
                .put("children", children)
                .put("translation", JSONArray().put(edit.moveX.toDouble()).put(edit.moveY.toDouble()).put(edit.moveZ.toDouble()))
                .put("rotation", JSONArray().put(rotation[0].toDouble()).put(rotation[1].toDouble())
                    .put(rotation[2].toDouble()).put(rotation[3].toDouble()))
                .put("scale", JSONArray().put(size.toDouble()).put(size.toDouble()).put(size.toDouble()))
            val parentIndex = nodes.length()
            nodes.put(parent)
            scene.put("nodes", JSONArray().put(parentIndex))
        }

        val json = document.toString().toByteArray(Charsets.UTF_8)
        val paddedSize = (json.size + 3) and -4
        val oldTailStart = 20L + oldJsonLength
        val newSize = 20L + paddedSize + (original.size.toLong() - oldTailStart)
        if (newSize > GlbHeader.MAX_BYTES || newSize > Int.MAX_VALUE) {
            throw IOException("Размер экспортируемого GLB превышает лимит 150 МБ.")
        }
        val output = ByteBuffer.allocate(newSize.toInt()).order(ByteOrder.LITTLE_ENDIAN)
        output.putInt(MAGIC)
        output.putInt(2)
        output.putInt(newSize.toInt())
        output.putInt(paddedSize)
        output.putInt(JSON_CHUNK)
        output.put(json)
        repeat(paddedSize - json.size) { output.put(0x20.toByte()) }
        output.put(original, oldTailStart.toInt(), original.size - oldTailStart.toInt())
        return output.array()
    }

    suspend fun export(
        context: Context,
        originalLocation: String,
        targetUri: Uri,
        edit: ModelEdit,
        visibleMaterials: Set<Int>? = null,
        partEdits: Map<Int, PartEdit> = emptyMap(),
        sculptStrokes: List<SculptStroke> = emptyList()
    ) = withContext(Dispatchers.IO) {
            val file = File(Uri.parse(originalLocation).path ?: throw IOException("Исходный GLB не найден."))
            if (!file.isFile || file.length() > GlbHeader.MAX_BYTES) {
                throw IOException("Исходный GLB недоступен или слишком большой.")
            }
            val original = file.readBytes()
            // Filter the renderable primitives first; apply the global transform second.
            // The underlying vertex buffers and textures remain binary-identical.
            val layersCopy = if (visibleMaterials == null) original
                else GlbLayers.filter(original, visibleMaterials)
            val sculpted = GlbSculpt.apply(layersCopy,
                sculptStrokes.filter { visibleMaterials == null || it.materialId in visibleMaterials })
            val partCopy = GlbPartTransforms.apply(sculpted, partEdits)
            val data = transform(partCopy, edit)
            val stream = context.contentResolver.openOutputStream(targetUri, "w")
                ?: throw IOException("Не удалось открыть файл для сохранения.")
            stream.use { it.write(data) }
        }
}
