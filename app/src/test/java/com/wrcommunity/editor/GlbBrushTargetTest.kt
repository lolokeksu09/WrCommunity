package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbBrushTargetTest {
    private fun input(transform: Boolean = false): ByteArray {
        val node = if (transform) """{"mesh":0,"translation":[0,1,0]}""" else """{"mesh":0}"""
        val json = """{"asset":{"version":"2.0"},"nodes":[$node],"scenes":[{"nodes":[0]}],
            "meshes":[{"primitives":[{"attributes":{"POSITION":0},"material":0},
              {"attributes":{"POSITION":1},"material":1}]}],
            "accessors":[{"type":"VEC3","min":[-1,0,-2],"max":[1,4,2]},
                         {"type":"VEC3","min":[-2,0,-3],"max":[2,2,3]}]}"""
        val bytes = json.toByteArray()
        val len = (bytes.size + 3) and -4
        return ByteBuffer.allocate(20 + len).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + len)
            .putInt(len).putInt(0x4E4F534A).put(bytes)
            .apply { repeat(len - bytes.size) { put(32.toByte()) } }
            .array()
    }

    @Test fun mapsTapToNormalizedCenterForSelectedMaterial() {
        val groups = GlbBrushTarget.inspect(input())
        assertEquals(setOf(0,1), groups.keys)
        assertEquals(BrushTarget(50,50,50), groups.getValue(0).at(0f,2f,0f))
        assertEquals(BrushTarget(100,0,50), groups.getValue(1).at(2f,0f,0f))
        assertNull(groups.getValue(0).at(-100f,400f,100f))
        assertEquals(BrushTarget(0,100,100), groups.getValue(0).at(-1f,4f,2f))
    }

    @Test fun complexTransformsAreNotSilentlyMisMapped() {
        assertTrue(GlbBrushTarget.inspect(input(transform=true)).isEmpty())
    }

    @Test fun invalidAndNonFiniteCoordinatesFailSafely() {
        val bounds = GlbBrushTarget.inspect(input()).getValue(0)
        assertNull(bounds.at(Float.NaN,0f,0f))
        assertNull(bounds.at(Float.POSITIVE_INFINITY,0f,0f))
    }
}
