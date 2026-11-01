package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbHeaderTest {
    private fun header(magic: Int = 0x46546C67, version: Int = 2, length: Int = 20): ByteArray =
        ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(magic).putInt(version).putInt(length).array()

    @Test fun acceptsGlb2() = assertNull(GlbHeader.error(header()))
    @Test fun rejectsEmptyFile() = assertNotNull(GlbHeader.error(byteArrayOf()))
    @Test fun rejectsWrongFormat() = assertNotNull(GlbHeader.error(header(magic = 0)))
    @Test fun rejectsWrongVersion() = assertNotNull(GlbHeader.error(header(version = 1)))
    @Test fun rejectsShortDeclaredSize() = assertNotNull(GlbHeader.error(header(length = 12)))
    @Test fun rejectsVeryLargeGlb() = assertNotNull(GlbHeader.error(header(length = 151 * 1024 * 1024)))
}
