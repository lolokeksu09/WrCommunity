package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class VertexAxisDragTest {
    private val vertex = VertexAxisAnchor(0f, 0f, 0f)

    @Test fun horizontalDragSnapsToTheChosenStepAndCreatesOneVertexMove() {
        val start = SurfaceRay(0f, 0f, 5f, 0f, 0f, -1f)
        val session = VertexAxisDrag.begin(vertex, 0, 0.1f, start)!!
        assertEquals(.3f, session.delta(SurfaceRay(.27f, 0f, 5f, 0f, 0f, -1f))!!, 1e-5f)
        val move = session.move(2, 3, 5, SurfaceRay(.27f, 0f, 5f, 0f, 0f, -1f))!!
        assertEquals(VertexMove(2, 3, 5, .3f, 0f, 0f), move)
        val history = VertexHistory().add(move)
        assertEquals(1, history.current.size)
        assertTrue(history.undo().current.isEmpty())
        assertEquals(move, history.undo().redo().current.single())
    }

    @Test fun negativeVerticalDragAndObliqueCameraUseModelCoordinates() {
        val start = SurfaceRay(0f, 0f, 5f, 0f, 0f, -2f)
        val session = VertexAxisDrag.begin(vertex, 1, 0.01f, start)!!
        assertEquals(-.18f, session.delta(SurfaceRay(0f, -.177f, 5f, 0f, 0f, -4f))!!, 1e-5f)
        assertEquals(VertexMove(0, 0, 1, 0f, -.18f, 0f),
            session.move(0, 0, 1, SurfaceRay(0f, -.177f, 5f, 0f, 0f, -4f)))
        val obliqueStart = SurfaceRay(4f, 0f, 4f, -1f, 0f, -1f)
        val zSession = VertexAxisDrag.begin(vertex, 2, 0.1f, obliqueStart)!!
        // The camera direction has components along X and Z; dragging a ray
        // perpendicular to the viewing direction is resolved in local 3D.
        val end = SurfaceRay(4f, 0f, 4.45f, -1f, 0f, -1f)
        assertEquals(.5f, zSession.delta(end)!!, 1e-4f)
    }

    @Test fun axisParallelToViewIsUnselectableRatherThanJumping() {
        val alongX = SurfaceRay(5f, 0f, 0f, -1f, 0f, 0f)
        assertNull(VertexAxisDrag.begin(vertex, 0, .1f, alongX))
        val nearParallel = SurfaceRay(5f, 0f, 0f, -1f, 0f, .01f)
        assertNull(VertexAxisDrag.begin(vertex, 0, .1f, nearParallel))
        val regular = VertexAxisDrag.begin(vertex, 0, .1f,
            SurfaceRay(0f, 0f, 5f, 0f, 0f, -1f))!!
        assertNull(regular.delta(alongX))
    }

    @Test fun invalidRaysAndAxesFailClosedWithoutHistoryMutation() {
        assertNull(VertexAxisDrag.begin(vertex, 0, .01f,
            SurfaceRay(Float.NaN, 0f, 5f, 0f, 0f, -1f)))
        assertNull(VertexAxisDrag.begin(vertex, 1, .01f,
            SurfaceRay(0f, 0f, 5f, 0f, 0f, 0f)))
        assertNull(VertexAxisDrag.begin(vertex, 1, .01f,
            SurfaceRay(0f, 0f, -5f, 0f, 0f, -1f))) // ray points away from model
        for (invalidAxis in listOf(-1, 3, 999)) {
            try {
                VertexAxisDrag.begin(vertex, invalidAxis, .1f,
                    SurfaceRay(0f, 0f, 5f, 0f, 0f, -1f))
                fail("Invalid axis accepted")
            } catch (_: IOException) {}
        }
        for (step in listOf(0f, -1f, Float.NaN)) {
            try {
                VertexAxisDrag.begin(vertex, 0, step,
                    SurfaceRay(0f, 0f, 5f, 0f, 0f, -1f))
                fail("Invalid step accepted")
            } catch (_: IOException) {}
        }
        val drag = VertexAxisDrag.begin(vertex, 0, .1f,
            SurfaceRay(0f, 0f, 5f, 0f, 0f, -1f))!!
        assertNull(drag.move(0, 0, 0,
            SurfaceRay(.02f, 0f, 5f, 0f, 0f, -1f)))
        assertTrue(VertexHistory().current.isEmpty())
    }

    @Test fun largeGestureIsBoundedToTheExistingSafeVertexMoveRange() {
        val drag = VertexAxisDrag.begin(vertex, 0, .01f,
            SurfaceRay(0f, 0f, 5f, 0f, 0f, -1f))!!
        assertEquals(3f, drag.delta(SurfaceRay(100f,0f,5f,0f,0f,-1f))!!, 0f)
        assertEquals(-3f, drag.delta(SurfaceRay(-100f,0f,5f,0f,0f,-1f))!!, 0f)
        drag.move(0, 0, 0, SurfaceRay(100f,0f,5f,0f,0f,-1f))!!.check()
    }

}
