package com.wrcommunity.editor

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbSmoothingTest {
    private fun input(brokenIndex: Boolean = false): ByteArray {
        val binary = ByteBuffer.allocate(120).order(ByteOrder.LITTLE_ENDIAN)
        // Four triangles share the raised center; material 1 is unrelated.
        listOf(
             0f, 0f, 1f, -1f,-1f,0f, 1f,-1f,0f,
             1f, 1f, 0f, -1f, 1f,0f
        ).forEach { binary.putFloat(it) }
        val faces = intArrayOf(
            0,1,2, 0,2,3, 0,3,4, 0,4,1
        )
        faces.forEachIndexed { i, v ->
            binary.putShort(if (brokenIndex && i == 2) 99.toShort() else v.toShort())
        }
        listOf(5f,0f,0f, 6f,0f,0f, 5f,1f,0f).forEach { binary.putFloat(it) }
        val json = """{"asset":{"version":"2.0"},"buffers":[{"byteLength":120}],
            "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":60},
                           {"buffer":0,"byteOffset":60,"byteLength":24},
                           {"buffer":0,"byteOffset":84,"byteLength":36}],
            "accessors":[{"bufferView":0,"componentType":5126,"count":5,"type":"VEC3",
                          "min":[-1,-1,0],"max":[1,1,1]},
                         {"bufferView":1,"componentType":5123,"count":12,"type":"SCALAR"},
                         {"bufferView":2,"componentType":5126,"count":3,"type":"VEC3",
                          "min":[5,0,0],"max":[6,1,0]}],
            "meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1,"material":0},
                                      {"attributes":{"POSITION":2},"material":1}]}],
            "materials":[{},{}],"nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}"""
        val raw = json.toByteArray()
        val padded = (raw.size + 3) and -4
        return ByteBuffer.allocate(20 + padded + 8 + 120).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + padded + 8 + 120)
            .putInt(padded).putInt(0x4E4F534A).put(raw)
            .apply { repeat(padded - raw.size) { put(32.toByte()) } }
            .putInt(120).putInt(0x004E4942).put(binary.array()).array()
    }

    private fun centerZ(data: ByteArray): Float {
        val length = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val json = JSONObject(String(data,20,length).trim())
        val primitive = json.getJSONArray("meshes").getJSONObject(0)
            .getJSONArray("primitives").getJSONObject(0)
        val accessorId = primitive.getJSONObject("attributes").getInt("POSITION")
        val acc = json.getJSONArray("accessors").getJSONObject(accessorId)
        val view = json.getJSONArray("bufferViews").getJSONObject(acc.getInt("bufferView"))
        return ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
            .getFloat(28 + length + view.getInt("byteOffset") + 8)
    }

    @Test fun smoothingReducesLocalPeakAndPreservesOtherMaterial() {
        val original = input()
        val smooth = GlbSculpt.apply(original, listOf(
            SculptStroke(materialId=0, centerX=50, centerY=50, centerZ=100,
                radius=100, strength=20, mode=SculptMode.SMOOTH)))
        assertEquals(1f, centerZ(original), 0f)
        assertTrue("smoothed center must flatten", centerZ(smooth) < .9f)
        assertTrue("smoothed center cannot invert", centerZ(smooth) > .7f)
        val oldBinStart = 28 + ByteBuffer.wrap(original).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val newBinStart = 28 + ByteBuffer.wrap(smooth).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        assertArrayEquals(
            original.copyOfRange(oldBinStart, oldBinStart + 120),
            smooth.copyOfRange(newBinStart, newBinStart + 120))
        assertNull(GlbValidation.error(smooth.copyOfRange(0,20),smooth.size.toLong()))
        assertArrayEquals(input(), original)
        val doc = JSONObject(String(smooth, 20,
            ByteBuffer.wrap(smooth).order(ByteOrder.LITTLE_ENDIAN).getInt(12)).trim())
        val primitives = doc.getJSONArray("meshes").getJSONObject(0).getJSONArray("primitives")
        assertEquals(2, primitives.getJSONObject(1).getJSONObject("attributes").getInt("POSITION"))
    }

    @Test fun aMixedPushAndSmoothPathIsOneUndoStep() {
        val a = SculptStroke(0, centerX=50,centerY=50,centerZ=100,radius=100,
            strength=10,axis=3)
        val b = a.copy(mode=SculptMode.SMOOTH)
        val history = SculptHistory().addPath(listOf(a,b))
        assertEquals(2, history.current.size)
        assertTrue(history.current[1].mode == SculptMode.SMOOTH)
        assertTrue(centerZ(GlbSculpt.apply(input(), listOf(a,b))) <
            centerZ(GlbSculpt.apply(input(), listOf(a))))
        assertTrue(history.undo().current.isEmpty())
        assertEquals(listOf(a,b), history.undo().redo().current)
    }

    @Test fun corruptTriangleIndexIsRejectedBeforeExport() {
        try {
            GlbSculpt.apply(input(brokenIndex=true), listOf(SculptStroke(
                0, centerX=50,centerY=50,centerZ=100,
                mode=SculptMode.SMOOTH)))
            fail("Invalid index accepted")
        } catch (_: IOException) {}
    }

    @Test fun invalidStrengthAndNoIndexGeometryHaveSafeFailure() {
        try {
            SculptStroke(0, strength=25, mode=SculptMode.SMOOTH).check()
            fail("Out-of-range smoothing strength accepted")
        } catch (_: IOException) {}
        assertEquals(SculptMode.PUSH, SculptStroke(0).mode)
    }
}
