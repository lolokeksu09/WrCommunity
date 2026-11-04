package com.wrcommunity.editor

import kotlin.math.abs

/**
 * Balanced bounding-volume hierarchy for the CPU triangle picker.
 *
 * It is built once for a preview GLB, on Dispatchers.Default. Queries visit
 * only triangle bounding boxes intersected by the ray; no per-triangle
 * allocations or UI-thread work. The hierarchy is immutable after creation.
 */
internal class TriangleBvh(
    private val positions: FloatArray,
    private val triangles: IntArray
) {
    internal data class Trace(
        val distance: Float?,
        val testedTriangles: Int,
        val visitedNodes: Int,
        val triangleIndex: Int? = null
    )
    private class Node(
        val bounds: FloatArray,
        val first: Int,
        val count: Int,
        var left: Int = -1,
        var right: Int = -1
    )
    private val order = IntArray(triangles.size / 3) { it }
    private val centroids = FloatArray(order.size * 3)
    private val nodes = ArrayList<Node>()
    private val root: Int

    init {
        require(triangles.size % 3 == 0 && triangles.isNotEmpty())
        require(positions.size % 3 == 0)
        for (t in order.indices) {
            var x = 0f
            var y = 0f
            var z = 0f
            for (vertex in 0..2) {
                val k = triangles[t * 3 + vertex] * 3
                require(k >= 0 && k + 2 < positions.size)
                x += positions[k]
                y += positions[k + 1]
                z += positions[k + 2]
            }
            centroids[t * 3] = x / 3f
            centroids[t * 3 + 1] = y / 3f
            centroids[t * 3 + 2] = z / 3f
        }
        root = build(0, order.size)
    }

    private fun build(first: Int, count: Int): Int {
        val b = floatArrayOf(
            Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY,
            Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY
        )
        val lo = floatArrayOf(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
        val hi = floatArrayOf(Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY)
        for (n in first until first + count) {
            val tri = order[n]
            for (v in 0..2) {
                val k = triangles[tri * 3 + v] * 3
                for (axis in 0..2) {
                    val value = positions[k + axis]
                    b[axis] = minOf(b[axis], value)
                    b[axis + 3] = maxOf(b[axis + 3], value)
                }
            }
            for (axis in 0..2) {
                val value = centroids[tri * 3 + axis]
                lo[axis] = minOf(lo[axis], value)
                hi[axis] = maxOf(hi[axis], value)
            }
        }
        val id = nodes.size
        val node = Node(b, first, count)
        nodes.add(node)
        if (count <= 12) return id

        val extents = FloatArray(3) { hi[it] - lo[it] }
        val axis = (0..2).maxByOrNull { extents[it] } ?: 0
        var mid = first + count / 2
        // Midpoint split is O(n), not a full sort. For coincident centroids
        // split by count to prevent unbounded recursion.
        if (extents[axis] > 1e-7f) {
            val pivot = lo[axis] + extents[axis] * .5f
            var a = first
            var z = first + count - 1
            while (a <= z) {
                val tri = order[a]
                if (centroids[tri * 3 + axis] < pivot) a++
                else {
                    val tmp = order[a]
                    order[a] = order[z]
                    order[z] = tmp
                    z--
                }
            }
            if (a in (first + 1) until (first + count)) mid = a
        }
        node.left = build(first, mid - first)
        node.right = build(mid, first + count - mid)
        return id
    }

    fun nearest(ray: SurfaceRay, maxDistance: Float = Float.POSITIVE_INFINITY): Float? =
        trace(ray, maxDistance).distance

    internal fun trace(ray: SurfaceRay, maxDistance: Float = Float.POSITIVE_INFINITY): Trace {
        if (!maxDistance.isFinite() && maxDistance != Float.POSITIVE_INFINITY)
            return Trace(null, 0, 0)
        if (maxDistance <= 0f || !ray.ox.isFinite() || !ray.oy.isFinite() ||
            !ray.oz.isFinite() || !ray.dx.isFinite() || !ray.dy.isFinite() ||
            !ray.dz.isFinite()) return Trace(null, 0, 0)
        if (ray.dx * ray.dx + ray.dy * ray.dy + ray.dz * ray.dz < 1e-14f)
            return Trace(null, 0, 0)
        var best = maxDistance
        var bestTriangle = -1
        var tests = 0
        var visits = 0
        val pending = java.util.ArrayDeque<Int>()
        pending.add(root)
        while (pending.isNotEmpty()) {
            val id = pending.removeLast()
            val node = nodes[id]
            if (entry(ray, node.bounds, best) == null) continue
            visits++
            if (node.left >= 0) {
                val li = node.left
                val ri = node.right
                val left = entry(ray, nodes[li].bounds, best)
                val right = entry(ray, nodes[ri].bounds, best)
                when {
                    left == null && right == null -> Unit
                    left == null -> pending.add(ri)
                    right == null -> pending.add(li)
                    left <= right -> { pending.add(ri); pending.add(li) }
                    else -> { pending.add(li); pending.add(ri) }
                }
                continue
            }
            for (n in node.first until node.first + node.count) {
                val tri = order[n] * 3
                val ai = triangles[tri] * 3
                val bi = triangles[tri + 1] * 3
                val ci = triangles[tri + 2] * 3
                tests++
                val ax = positions[ai]; val ay = positions[ai+1]; val az = positions[ai+2]
                val e1x = positions[bi] - ax
                val e1y = positions[bi+1] - ay
                val e1z = positions[bi+2] - az
                val e2x = positions[ci] - ax
                val e2y = positions[ci+1] - ay
                val e2z = positions[ci+2] - az
                val hx = ray.dy * e2z - ray.dz * e2y
                val hy = ray.dz * e2x - ray.dx * e2z
                val hz = ray.dx * e2y - ray.dy * e2x
                val determinant = e1x * hx + e1y * hy + e1z * hz
                if (abs(determinant) < 1e-8f) continue
                val inv = 1f / determinant
                val sx = ray.ox - ax
                val sy = ray.oy - ay
                val sz = ray.oz - az
                val u = (sx * hx + sy * hy + sz * hz) * inv
                if (u < 0f || u > 1f) continue
                val qx = sy * e1z - sz * e1y
                val qy = sz * e1x - sx * e1z
                val qz = sx * e1y - sy * e1x
                val v = (ray.dx * qx + ray.dy * qy + ray.dz * qz) * inv
                if (v < 0f || u + v > 1f) continue
                val hit = (e2x * qx + e2y * qy + e2z * qz) * inv
                if (hit > 1e-6f && hit < best && hit.isFinite()) {
                    best = hit
                    bestTriangle = order[n]
                }
            }
        }
        return Trace(best.takeIf { it < maxDistance }, tests, visits,
            bestTriangle.takeIf { it >= 0 })
    }

    private fun entry(ray: SurfaceRay, bounds: FloatArray, distance: Float): Float? {
        var near = 0f
        var far = distance
        for (axis in 0..2) {
            val o = when (axis) { 0 -> ray.ox; 1 -> ray.oy; else -> ray.oz }
            val d = when (axis) { 0 -> ray.dx; 1 -> ray.dy; else -> ray.dz }
            val low = bounds[axis]
            val high = bounds[axis + 3]
            if (abs(d) < 1e-12f) {
                if (o < low || o > high) return null
                continue
            }
            var a = (low - o) / d
            var b = (high - o) / d
            if (a > b) { val tmp = a; a = b; b = tmp }
            near = maxOf(near, a)
            far = minOf(far, b)
            if (near > far) return null
        }
        return near
    }
}
