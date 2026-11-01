package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbLayersTest {
    private fun fixture(): ByteArray {
        val json = """{"asset":{"version":"2.0"},"materials":[{"name":"Skin"},{"name":"Hair"}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"material":0},{"attributes":{"POSITION":1},"material":1}]}],"nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}""".toByteArray()
        val len = (json.size + 3) and -4
        return ByteBuffer.allocate(20 + len + 12).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + len + 12)
            .putInt(len).putInt(0x4E4F534A).put(json)
            .apply { repeat(len - json.size) { put(32.toByte()) } }
            .putInt(4).putInt(0x004E4942).put(byteArrayOf(1, 2, 3, 4))
            .array()
    }

    private fun json(glb: ByteArray): JSONObject {
        val n = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        return JSONObject(String(glb, 20, n).trim())
    }

    @Test fun extractsMaterialGroups() {
        val layers = GlbLayers.layers(fixture())
        assertEquals(listOf(0, 1), layers.map { it.id })
        assertEquals(listOf("Skin", "Hair"), layers.map { it.name })
    }

    @Test fun hidesHairButPreservesBinaryAndOriginal() {
        val source = fixture()
        val before = source.copyOf()
        val out = GlbLayers.filter(source, setOf(0))
        assertArrayEquals(before, source)
        val primitives = json(out).getJSONArray("meshes").getJSONObject(0).getJSONArray("primitives")
        assertEquals(1, primitives.length())
        assertEquals(0, primitives.getJSONObject(0).getInt("material"))
        assertArrayEquals(source.takeLast(12).toByteArray(), out.takeLast(12).toByteArray())
        assertNull(GlbValidation.error(out.copyOfRange(0, 20), out.size.toLong()))
    }

    @Test fun showAllReturnsByteIdenticalGlb() {
        val source = fixture()
        assertArrayEquals(source, GlbLayers.filter(source, setOf(0, 1)))
    }

    @Test fun allHiddenFailsSafely() {
        try {
            GlbLayers.filter(fixture(), emptySet())
            fail("Must reject an empty material selection")
        } catch (_: IOException) { }
    }

    @Test fun canUndoIsolateAndRedoLayerVisibility() {
        val a = LayerHistory(states = listOf(setOf(0, 1)))
        val b = a.change(setOf(1))
        assertEquals(setOf(1), b.current)
        assertEquals(setOf(0, 1), b.undo().current)
        assertEquals(setOf(1), b.undo().redo().current)
        assertFalse(b.undo().change(setOf(0)).canRedo)
        assertEquals(setOf(1), b.change(emptySet()).current)
    }
}
