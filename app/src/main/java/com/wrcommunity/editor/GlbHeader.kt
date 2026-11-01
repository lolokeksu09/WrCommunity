package com.wrcommunity.editor

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Validate the 12-byte binary glTF 2.0 header without loading the model into memory. */
object GlbHeader {
    const val MAX_BYTES: Long = 150L * 1024 * 1024

    fun error(header: ByteArray): String? {
        if (header.size < 12) return "Файл слишком короткий: это не GLB."
        val data = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
        if (data.int != 0x46546C67) return "Неверный формат: нужен файл GLB."
        if (data.int != 2) return "Поддерживается только glTF 2.0."
        val declared = data.int.toLong() and 0xffffffffL
        if (declared < 20) return "Повреждённый заголовок GLB."
        if (declared > MAX_BYTES) return "Файл больше лимита 150 МБ."
        return null
    }
}
