package com.wrcommunity.editor

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbNormalsTest {
    private fun input(mode: Int = 4, badIndex: Boolean = false, tangent: Boolean = false): ByteArray {
        val bin = ByteBuffer.allocate(80).order(ByteOrder.LITTLE_ENDIAN)
        val verts = floatArrayOf(0f,0f,0f, 1f,0f,0f, 0f,1f,0f)
        val normals = floatArrayOf(0f,0f,1f, 0f,0f,1f, 0f,0f,1f)
        verts.forEach { bin.putFloat(it) }
        normals.forEach { bin.putFloat(it) }
        bin.putShort(0)
        bin.putShort(1)
        bin.putShort(if (badIndex) 40 else 2)
        bin.putShort(0)

        val attributes = if (tangent) {
            """{"POSITION":0,"NORMAL":1,"TANGENT":1}"""
        } else """{"POSITION":0,"NORMAL":1}"""
        val json = """
        {"asset":{"version":"2.0"},"buffers":[{"byteLength":80}],
         "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36},
                        {"buffer":0,"byteOffset":36,"byteLength":36},
                        {"buffer":0,"byteOffset":72,"byteLength":8}],
         "accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"},
                      {"bufferView":1,"componentType":5126,"count":3,"type":"VEC3"},
                      {"bufferView":2,"componentType":5123,"count":3,"type":"SCALAR"}],
         "meshes":[{"primitives":[{"attributes":$attributes,"indices":2,"material":0,"mode":$mode},
                                  {"attributes":$attributes,"indices":2,"material":1,"mode":$mode}]}],
         "materials":[{},{}],"nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}
        """.trimIndent().toByteArray()
        val pad = (json.size + 3) and -4
        return ByteBuffer.allocate(20 + pad + 8 + 80).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + pad + 8 + 80)
            .putInt(pad).putInt(0x4E4F534A).put(json)
            .apply { repeat(pad - json.size) { put(32.toByte()) } }
            .putInt(80).putInt(0x004E4942).put(bin.array()).array()
    }

    private fun document(glb: ByteArray): JSONObject {
        val len = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        return JSONObject(String(glb, 20, len).trim())
    }

    @Test fun deformedFaceHasRecalculatedNormalsButOtherMaterialRemainsUntouched() {
        val source = input()
        val output = GlbSculpt.apply(source, listOf(
            SculptStroke(0, centerX=0, centerY=0, centerZ=0,
                radius=100, axis=3, strength=20)))
        val root = document(output)
        val prim = root.getJSONArray("meshes").getJSONObject(0).getJSONArray("primitives")
        val changedNormal = prim.getJSONObject(0).getJSONObject("attributes").getInt("NORMAL")
        val otherNormal = prim.getJSONObject(1).getJSONObject("attributes").getInt("NORMAL")
        assertTrue("recomputed accessor is private", changedNormal > 2)
        assertEquals("untouched material retains original", 1, otherNormal)
        val accessor = root.getJSONArray("accessors").getJSONObject(changedNormal)
        val view = root.getJSONArray("bufferViews").getJSONObject(accessor.getInt("bufferView"))
        val offset = 28 + ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN).getInt(12) +
            view.getInt("byteOffset")
        val floats = ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN)
        val nx = floats.getFloat(offset)
        val ny = floats.getFloat(offset + 4)
        val nz = floats.getFloat(offset + 8)
        assertTrue("recomputed normal must tilt", kotlin.math.abs(nx) > 0.01f || kotlin.math.abs(ny) > 0.01f)
        assertEquals(1.0, kotlin.math.sqrt((nx*nx + ny*ny + nz*nz).toDouble()), 0.001)
        assertArrayEquals("original buffer unchanged", source.copyOfRange(source.size-80,source.size),
            output.copyOfRange(28 + ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN).getInt(12),
                28 + ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN).getInt(12) + 80))
        assertNull(GlbValidation.error(output.copyOfRange(0,20),output.size.toLong()))
    }

    @Test fun invalidTriangleIndexIsRejected() {
        try {
            GlbSculpt.apply(input(badIndex=true), listOf(SculptStroke(0,radius=100)))
            fail("invalid index allowed")
        } catch (_: IOException) { }
    }

    @Test fun unsupportedLineModeIsRejected() {
        try {
            GlbSculpt.apply(input(mode=1), listOf(SculptStroke(0,radius=100)))
            fail("line primitives should not be edited")
        } catch (_: IOException) { }
    }

    @Test fun tangentMeshIsRejectedRatherThanExportedWithWrongLighting() {
        try {
            GlbSculpt.apply(input(tangent=true), listOf(SculptStroke(0,radius=100)))
            fail("tangent-based mesh needs a tangent-aware solution")
        } catch (_: IOException) { }
    }
}
