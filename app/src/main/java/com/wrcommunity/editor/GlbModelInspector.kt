package com.wrcommunity.editor

import org.json.JSONArray
import org.json.JSONObject
import java.io.DataInputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Reads only a GLB's bounded JSON chunk, not the potentially 150 MiB BIN.
 * Counts geometry in mesh *definitions*; repeated instances are never
 * counted as extra triangles, and overlapping accessors are not de-duplicated.
 * This is metadata for the user, NOT an integrity validator for the BIN.
 */
data class GlbModelReport(
    val bytes: Long,
    val meshes: Int,
    val primitives: Int,
    val nodes: Int,
    val scenes: Int,
    val materials: Int,
    val textures: Int,
    val images: Int,
    val animations: Int,
    val skins: Int,
    val morphTargets: Int,
    val vertexReferences: Long,
    val triangles: Long,
    val nonTrianglePrimitives: Int,
    val unknownGeometryPrimitives: Int,
    val warnings: List<String>
)

object GlbModelInspector {
    private const val MAX_JSON_BYTES = 16 * 1024 * 1024

    fun inspect(file: File): GlbModelReport {
        if (!file.isFile || file.length() !in 20..GlbHeader.MAX_BYTES)
            throw IOException("Файл GLB для анализа недоступен.")
        return DataInputStream(FileInputStream(file).buffered()).use { input ->
            val prefix = ByteArray(20)
            try { input.readFully(prefix) }
            catch (_: Exception) { throw IOException("Заголовок GLB обрезан.") }
            GlbValidation.error(prefix, file.length())?.let { throw IOException(it) }
            val length = ByteBuffer.wrap(prefix).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
            if (length <= 0 || length > MAX_JSON_BYTES)
                throw IOException("JSON GLB слишком большой для быстрого анализа (лимит 16 МиБ).")
            val bytes = ByteArray(length)
            try { input.readFully(bytes) }
            catch (_: Exception) { throw IOException("JSON GLB обрезан.") }
            val json = try {
                JSONObject(String(bytes, Charsets.UTF_8).trimEnd(' ', '\u0000'))
            } catch (_: Exception) {
                throw IOException("Невозможно прочитать описание glTF.")
            }
            parse(json, file.length())
        }
    }

    internal fun parse(root: JSONObject, bytes: Long): GlbModelReport {
        if (root.optJSONObject("asset")?.optString("version") != "2.0")
            throw IOException("Поддерживается только glTF 2.0.")
        fun count(key: String): Int = root.optJSONArray(key)?.length() ?: 0
        val meshes = root.optJSONArray("meshes") ?: JSONArray()
        val accessors = root.optJSONArray("accessors") ?: JSONArray()

        fun accessorCount(id: Int): Long? {
            if (id !in 0 until accessors.length()) return null
            val obj = accessors.optJSONObject(id) ?: return null
            val n = obj.optLong("count", -1L)
            return n.takeIf { it in 1..GlbHeader.MAX_BYTES }
        }

        var primitiveCount = 0
        var vertices = 0L
        var triangles = 0L
        var nonTriangle = 0
        var unknown = 0
        var morphTargets = 0
        for (m in 0 until meshes.length()) {
            val parts = meshes.optJSONObject(m)?.optJSONArray("primitives")
                ?: continue
            primitiveCount += parts.length()
            for (p in 0 until parts.length()) {
                val primitive = parts.optJSONObject(p)
                if (primitive == null) {
                    unknown++
                    continue
                }
                morphTargets += primitive.optJSONArray("targets")?.length() ?: 0
                val positionId = primitive.optJSONObject("attributes")
                    ?.optInt("POSITION", -1) ?: -1
                val positionCount = accessorCount(positionId)
                if (positionCount == null) {
                    unknown++
                    continue
                }
                vertices += positionCount
                val indexCount = if (primitive.has("indices"))
                    accessorCount(primitive.optInt("indices", -1))
                else positionCount
                if (indexCount == null) {
                    unknown++
                    continue
                }
                when (primitive.optInt("mode", 4)) {
                    4 -> triangles += indexCount / 3L
                    5, 6 -> triangles += (indexCount - 2L).coerceAtLeast(0L)
                    0, 1, 2, 3 -> nonTriangle++
                    else -> unknown++
                }
            }
        }

        val warnings = buildList {
            if (count("animations") > 0 || count("skins") > 0)
                add("В GLB есть анимации или скелет: скульптинг и правка частей их не поддерживают.")
            if (morphTargets > 0)
                add("Morph targets присутствуют: правка отдельных частей их не поддерживает.")
            if (nonTriangle > 0)
                add("Есть примитивы точек или линий: в счёт треугольников они не включены.")
            if (unknown > 0)
                add("Подсчёт геометрии может быть неполным: часть примитивов не удалось оценить.")
        }
        return GlbModelReport(
            bytes = bytes,
            meshes = meshes.length(),
            primitives = primitiveCount,
            nodes = count("nodes"),
            scenes = count("scenes"),
            materials = count("materials"),
            textures = count("textures"),
            images = count("images"),
            animations = count("animations"),
            skins = count("skins"),
            morphTargets = morphTargets,
            vertexReferences = vertices,
            triangles = triangles,
            nonTrianglePrimitives = nonTriangle,
            unknownGeometryPrimitives = unknown,
            warnings = warnings
        )
    }
}
