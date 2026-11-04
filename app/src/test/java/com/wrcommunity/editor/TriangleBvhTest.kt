package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test

class TriangleBvhTest {
    private fun grid(squares: Int): Pair<FloatArray, IntArray> {
        val vertices = FloatArray((squares + 1) * (squares + 1) * 3)
        for (y in 0..squares) for (x in 0..squares) {
            val at = (y * (squares + 1) + x) * 3
            vertices[at] = x.toFloat()
            vertices[at + 1] = y.toFloat()
        }
        val indices = IntArray(squares * squares * 6)
        var at = 0
        for (y in 0 until squares) for (x in 0 until squares) {
            val a = y * (squares + 1) + x
            val b = a + 1
            val c = a + squares + 1
            val d = c + 1
            for (i in intArrayOf(a, b, c, b, d, c)) indices[at++] = i
        }
        return vertices to indices
    }

    @Test fun nearestTriangleIsIdenticalForGridRays() {
        val (positions, triangles) = grid(32)
        val bvh = TriangleBvh(positions, triangles)
        for (x in 0 until 32 step 3) for (y in 0 until 32 step 5) {
            val hit = bvh.trace(SurfaceRay(x + .2f, y + .4f, 5f, 0f, 0f, -1f))
            assertNotNull("expected grid hit at $x/$y", hit.distance)
            assertEquals(5f, hit.distance!!, 1e-5f)
        }
        assertNull(bvh.trace(SurfaceRay(-1f, -1f, 5f, 0f, 0f, -1f)).distance)
    }

    @Test fun testsSmallFractionOfLargeGrid() {
        val (positions, triangles) = grid(128)
        val bvh = TriangleBvh(positions, triangles)
        val hit = bvh.trace(SurfaceRay(37.24f, 81.32f, 2f, 0f, 0f, -1f))
        assertEquals(2f, hit.distance!!, 1e-5f)
        val total = triangles.size / 3
        assertTrue("BVH must cull triangles: checked ${hit.testedTriangles} / $total",
            hit.testedTriangles < total / 12)
        assertTrue("BVH tree traversal must remain bounded", hit.visitedNodes < total / 8)
    }

    @Test fun distanceLimitAndParallelRayCannotHit() {
        val (positions, triangles) = grid(4)
        val bvh = TriangleBvh(positions, triangles)
        val ray = SurfaceRay(.3f, .4f, 5f, 0f, 0f, -1f)
        assertNull(bvh.trace(ray, 4f).distance)
        assertEquals(5f, bvh.trace(ray, 6f).distance!!, 1e-5f)
        assertNull(bvh.trace(SurfaceRay(.3f, .4f, 5f, 1f, 0f, 0f)).distance)
    }

    @Test fun degenerateCentroidsStillBuildBalancedTree() {
        val vertices = floatArrayOf(0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f, 0f)
        val triangles = IntArray(300 * 3) { it % 3 }
        val tree = TriangleBvh(vertices, triangles)
        val result = tree.trace(SurfaceRay(.1f, .1f, 2f, 0f, 0f, -1f))
        assertEquals(2f, result.distance!!, 1e-5f)
        assertTrue(result.visitedNodes < 300)
    }
}
