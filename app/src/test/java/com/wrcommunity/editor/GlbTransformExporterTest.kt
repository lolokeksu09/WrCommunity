package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbTransformExporterTest {
    private fun glb(): ByteArray {
        val document = """{"asset":{"version":"2.0"},"nodes":[{"name":"mesh"}],"scenes":[{"nodes":[0]}],"scene":0}"""
        val raw = document.toByteArray()
        val padded = (raw.size + 3) and -4
        val bin = byteArrayOf(1, 2, 3, 4)
        return ByteBuffer.allocate(20 + padded + 8 + bin.size).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + padded + 8 + bin.size)
            .putInt(padded).putInt(0x4E4F534A).put(raw)
            .apply { repeat(padded - raw.size) { put(32.toByte()) } }
            .putInt(bin.size).putInt(0x004E4942).put(bin).array()
    }

    @Test fun identityDoesNotRewriteGeometryOrChunks() {
        assertArrayEquals(glb(), GlbTransformExporter.transform(glb(), ModelEdit()))
    }

    @Test fun rotateScaleMoveKeepsOriginalNodeAndBinaryChunk() {
        val original = glb()
        val changed = GlbTransformExporter.transform(
            original, ModelEdit(y = 90, moveY = 2f, scalePercent = 150)
        )
        val buf = ByteBuffer.wrap(changed).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(changed.size, buf.getInt(8))
        val doc = JSONObject(String(changed, 20, buf.getInt(12)).trim())
        val nodes = doc.getJSONArray("nodes")
        assertEquals("mesh", nodes.getJSONObject(0).getString("name"))
        val added = nodes.getJSONObject(1)
        assertEquals(0, added.getJSONArray("children").getInt(0))
        assertEquals(2.0, added.getJSONArray("translation").getDouble(1), 0.0001)
        assertEquals(1.5, added.getJSONArray("scale").getDouble(0), 0.0001)
        val q = added.getJSONArray("rotation")
        assertEquals(0.7071, q.getDouble(1), 0.001)
        assertEquals(1, doc.getJSONArray("scenes").getJSONObject(0).getJSONArray("nodes").getInt(0))
        assertArrayEquals(original.takeLast(12).toByteArray(), changed.takeLast(12).toByteArray())
    }

    @Test fun undoRedoBranchesAreConsistent() {
        val a = EditHistory().change(ModelEdit(y = 15)).change(ModelEdit(y = 30))
        assertEquals(15, a.undo().current.y)
        assertEquals(30, a.undo().redo().current.y)
        val b = a.undo().change(ModelEdit(y = 45))
        assertFalse(b.canRedo)
        assertEquals(45, b.current.y)
    }

    @Test fun malformedGlbIsNotExported() {
        try {
            GlbTransformExporter.transform(byteArrayOf(1, 2, 3), ModelEdit(y = 15))
            fail("invalid GLB accepted")
        } catch (_: java.io.IOException) { }
    }

    @Test fun invalidScaleIsRejected() {
        try {
            GlbTransformExporter.transform(glb(), ModelEdit(scalePercent = 0))
            fail("invalid scale accepted")
        } catch (_: java.io.IOException) { }
    }
}
