package com.wrcommunity.editor

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Checks actual byte count and mandatory JSON chunk, not just the 12-byte header. */
object GlbValidation {
    fun error(prefix: ByteArray, actualSize: Long): String? {
        if (prefix.size < 20 || actualSize < 20) return "Файл слишком короткий для GLB."
        GlbHeader.error(prefix.copyOfRange(0, 12))?.let { return it }
        val header = ByteBuffer.wrap(prefix).order(ByteOrder.LITTLE_ENDIAN)
        header.position(8)
        val declaredSize = header.int.toLong() and 0xffffffffL
        if (declaredSize != actualSize) return "GLB повреждён: размер не совпадает с заголовком."
        val jsonChunkLength = header.int.toLong() and 0xffffffffL
        if (header.int != 0x4E4F534A) return "GLB повреждён: отсутствует JSON-блок."
        if (jsonChunkLength < 4 || jsonChunkLength % 4L != 0L || jsonChunkLength > actualSize - 20) {
            return "GLB повреждён: неверная длина JSON-блока."
        }
        return null
    }
}
