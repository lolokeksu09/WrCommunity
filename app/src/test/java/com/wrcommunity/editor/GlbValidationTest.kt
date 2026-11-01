package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbValidationTest {
    private fun prefix(
        declaredSize: Int = 24,
        chunkSize: Int = 4,
        chunkType: Int = 0x4E4F534A
    ): ByteArray = ByteBuffer.allocate(20).order(ByteOrder.LITTLE_ENDIAN)
        .putInt(0x46546C67)
        .putInt(2)
        .putInt(declaredSize)
        .putInt(chunkSize)
        .putInt(chunkType)
        .array()

    @Test fun acceptsMinimalGlb() = assertNull(GlbValidation.error(prefix(), 24))
    @Test fun rejectsTruncatedDocument() = assertNotNull(GlbValidation.error(prefix(), 20))
    @Test fun rejectsMissingJsonChunk() = assertNotNull(GlbValidation.error(prefix(chunkType = 0), 24))
    @Test fun rejectsOutOfBoundsChunk() = assertNotNull(GlbValidation.error(prefix(chunkSize = 128), 24))
    @Test fun rejectsUnalignedChunk() = assertNotNull(GlbValidation.error(prefix(chunkSize = 3), 24))
    @Test fun rejectsShortHeader() = assertNotNull(GlbValidation.error(ByteArray(12), 12))
}
