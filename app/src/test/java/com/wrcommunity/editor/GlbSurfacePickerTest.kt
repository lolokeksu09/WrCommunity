package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbSurfacePickerTest {
    private fun fixture(broken: Boolean = false, transformed: Boolean = false): ByteArray {
        val bin = ByteBuffer.allocate(96).order(ByteOrder.LITTLE_ENDIAN)
        val vertices = floatArrayOf(
            0f,0f,0f, 1f,0f,0f, 0f,1f,0f,
            0f,0f,-1f, 1f,0f,-1f, 0f,1f,-1f)
        vertices.forEach { bin.putFloat(it) }
        // one triangle on each plane, padded to four-byte alignment
        bin.putShort(0).putShort(1).putShort(if (broken) 300 else 2).putShort(0)
        bin.putShort(0).putShort(1).putShort(2).putShort(0)
        val node = if (transformed) """{"mesh":0,"translation":[0,1,0]}"""
            else """{"mesh":0}"""
        val json = """{"asset":{"version":"2.0"},"buffers":[{"byteLength":96}],
            "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36},
                           {"buffer":0,"byteOffset":36,"byteLength":36},
                           {"buffer":0,"byteOffset":72,"byteLength":8},
                           {"buffer":0,"byteOffset":80,"byteLength":8}],
            "accessors":[{"bufferView":0,"count":3,"type":"VEC3","componentType":5126},
                         {"bufferView":1,"count":3,"type":"VEC3","componentType":5126},
                         {"bufferView":2,"count":3,"type":"SCALAR","componentType":5123},
                         {"bufferView":3,"count":3,"type":"SCALAR","componentType":5123}],
            "meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":2,"material":0},
                                      {"attributes":{"POSITION":1},"indices":3,"material":1}]}],
            "nodes":[$node],"scenes":[{"nodes":[0]}],"scene":0}"""
        val raw=json.toByteArray()
        val padded=(raw.size+3) and -4
        return ByteBuffer.allocate(20+padded+8+96).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20+padded+8+96)
            .putInt(padded).putInt(0x4E4F534A).put(raw)
            .apply { repeat(padded-raw.size){put(32.toByte())} }
            .putInt(96).putInt(0x004E4942).put(bin.array()).array()
    }

    private val forward = SurfaceRay(.25f,.25f,2f,0f,0f,-1f)

    @Test fun picksExactNearestTriangleAndMaterial() {
        val picker=GlbSurfacePicker.fromBytes(fixture())
        assertEquals(setOf(0,1), picker.materialIds)
        val hit=picker.pick(forward,0,setOf(0,1))!!
        assertEquals(0f,hit.z,.0001f)
        assertEquals(2f,hit.distance,.0001f)
        assertEquals(BrushTarget(25,25,50),hit.center)
    }

    @Test fun doesNotSculptAnOccludedMaterial() {
        val picker=GlbSurfacePicker.fromBytes(fixture())
        assertNull(picker.pick(forward,1,setOf(0,1)))
        val rear=picker.pick(forward,1,setOf(1))!!
        assertEquals(-1f,rear.z,.00001f)
        assertEquals(3f,rear.distance,.00001f)
    }

    @Test fun noFaceAndInvalidInputSafelyReturnNull() {
        val picker=GlbSurfacePicker.fromBytes(fixture())
        assertNull(picker.pick(SurfaceRay(3f,3f,2f,0f,0f,-1f),0,setOf(0)))
        assertNull(picker.pick(SurfaceRay(Float.NaN,0f,1f,0f,0f,-1f),0,setOf(0)))
        assertNull(picker.pick(forward,0,emptySet()))
    }

    @Test fun malformedIndexFailsBeforeTouch() {
        try {
            GlbSurfacePicker.fromBytes(fixture(broken=true))
            fail("Bad index accepted")
        } catch (_: IOException) { }
    }

    @Test fun transformedSceneRequiresManualSculpting() {
        try {
            GlbSurfacePicker.fromBytes(fixture(transformed=true))
            fail("Transformation is unsupported")
        } catch (_: IOException) { }
    }
    @Test fun rebuildPickerAfterSculptSeesUpdatedTriangles() {
        val source = fixture()
        val before = GlbSurfacePicker.fromBytes(source)
            .pick(forward, 0, setOf(0, 1))!!
        val sculpted = GlbSculpt.apply(source,
            listOf(SculptStroke(
                materialId = 0,
                centerX = 0, centerY = 0, centerZ = 0,
                radius = 100, axis = 3, strength = 20
            )))
        val after = GlbSurfacePicker.fromBytes(sculpted)
            .pick(forward, 0, setOf(0, 1))!!
        assertTrue("Picker must follow the changed POSITION buffer", after.z > before.z + 0.03f)
        assertEquals(0, after.materialId)
        // The original source stays unchanged.
        assertArrayEquals(fixture(), source)
    }

}
