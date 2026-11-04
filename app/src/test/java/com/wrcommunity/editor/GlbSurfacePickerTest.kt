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

    @Test fun repeatStrokeUsesOriginalMaterialBoundsInsteadOfDriftingWithSculpt() {
        val src = fixture()
        val changed = GlbSculpt.apply(src, listOf(SculptStroke(
            0, centerX = 100, centerY = 0, centerZ = 50,
            radius = 100, axis = 1, strength = 20
        )))
        val point = GlbSurfacePicker.fromBytes(changed).pick(
            SurfaceRay(.75f, .05f, 2f, 0f, 0f, -1f), 0, setOf(0, 1)
        )!!
        val sourceBounds = BrushMaterialBounds(0,
            listOf(0f, 0f, 0f), listOf(1f, 1f, 0f))
        val mapped = sourceBounds.at(point.x, point.y, point.z)!!
        assertEquals(75, mapped.x)
        assertTrue("Deformed bounds would shift the next center", point.center.x < mapped.x)
    }

    @Test fun touchOnFrontTriangleSelectsNearestActualVertexAndSourceIndex() {
        val picker = GlbSurfacePicker.fromBytes(fixture())
        val nearCorner = picker.pickVertex(
            SurfaceRay(.1f, .1f, 2f, 0f, 0f, -1f), 0, setOf(0, 1))!!
        assertEquals(0, nearCorner.mesh)
        assertEquals(0, nearCorner.primitive)
        assertEquals(0, nearCorner.vertex)
        assertEquals(0, nearCorner.materialId)
        assertEquals(0f, nearCorner.z, 1e-5f)
        val nearB = picker.pickVertex(
            SurfaceRay(.9f, .03f, 2f, 0f, 0f, -1f), 0, setOf(0, 1))!!
        assertEquals(1, nearB.vertex)
        assertEquals(0, nearB.primitive)
        val nearC = picker.pickVertex(
            SurfaceRay(.06f, .9f, 2f, 0f, 0f, -1f), 0, setOf(0, 1))!!
        assertEquals(2, nearC.vertex)
    }

    @Test fun selectedRearMaterialCannotPickThroughVisibleFrontFace() {
        val picker = GlbSurfacePicker.fromBytes(fixture())
        assertNull(picker.pickVertex(forward, 1, setOf(0, 1)))
        val rear = picker.pickVertex(forward, 1, setOf(1))!!
        assertEquals(1, rear.primitive)
        assertEquals(0, rear.mesh)
        assertEquals(1, rear.materialId)
        assertEquals(-1f, rear.z, 1e-6f)
    }

    @Test fun invalidOrOutsideRayCannotSelectVertex() {
        val picker = GlbSurfacePicker.fromBytes(fixture())
        assertNull(picker.pickVertex(SurfaceRay(3f, 3f, 2f, 0f, 0f, -1f),
            0, setOf(0,1)))
        assertNull(picker.pickVertex(SurfaceRay(Float.NaN, 0f, 2f, 0f,0f,-1f),
            0, setOf(0,1)))
        assertNull(picker.pickVertex(forward, 0, emptySet()))
        assertNull(picker.pickVertex(forward, 7, setOf(0,1)))
    }

    @Test fun pickingDeformedPreviewStillReturnsOriginalPrimitiveAndVertexIds() {
        val source = fixture()
        val moved = GlbVertexEditor.apply(source,
            listOf(VertexMove(0,0,0,0.1f,0f,0f)))
        val picker = GlbSurfacePicker.fromBytes(moved)
        val selected = picker.pickVertex(
            SurfaceRay(.11f,.05f,2f,0f,0f,-1f),0,setOf(0,1))!!
        assertEquals(0, selected.mesh)
        assertEquals(0, selected.primitive)
        assertEquals(0, selected.vertex)
        assertArrayEquals(fixture(),source)
    }
    @Test fun vertexAnchorReadsExactCurrentPositionsAfterEdits() {
        val original = fixture()
        val picker = GlbSurfacePicker.fromBytes(original)
        val before = picker.vertexPosition(0, 0, 1)!!
        assertEquals(1f, before.x, 1e-6f)
        assertEquals(0f, before.y, 1e-6f)
        assertEquals(0f, before.z, 1e-6f)
        assertNull(picker.vertexPosition(0, 0, 99))
        assertNull(picker.vertexPosition(0, 4, 1))
        assertNull(picker.vertexPosition(2, 0, 1))
        val output = GlbVertexEditor.apply(original,
            listOf(VertexMove(0, 0, 1, .25f, 0f, 0f)))
        val after = GlbSurfacePicker.fromBytes(output).vertexPosition(0, 0, 1)!!
        assertEquals(1.25f, after.x, 1e-6f)
        assertEquals(0f, after.y, 1e-6f)
        assertEquals(0f, after.z, 1e-6f)
        assertArrayEquals(fixture(), original)
    }
    @Test fun axisGestureActuallyMovesGlbPositionWithoutMutatingAnotherPrimitive() {
        val src = fixture()
        val picker = GlbSurfacePicker.fromBytes(src)
        val anchor = picker.vertexPosition(0, 0, 1)!!
        val beforeOther = picker.vertexPosition(0, 1, 1)!!
        val start = SurfaceRay(.4f, 0f, 5f, 0f, 0f, -1f)
        val end = SurfaceRay(.7f, 0f, 5f, 0f, 0f, -1f)
        val gesture = VertexAxisDrag.begin(anchor, 0, .1f, start)!!
        val move = gesture.move(0, 0, 1, end)!!
        val changed = GlbVertexEditor.apply(src, listOf(move))
        val after = GlbSurfacePicker.fromBytes(changed)
        assertEquals(1.3f, after.vertexPosition(0, 0, 1)!!.x, 1e-5f)
        assertEquals(beforeOther, after.vertexPosition(0, 1, 1))
        assertArrayEquals(fixture(), src)
        GlbIntegrity.validate(changed)
    }

}
