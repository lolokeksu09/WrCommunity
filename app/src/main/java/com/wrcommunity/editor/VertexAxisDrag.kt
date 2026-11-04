package com.wrcommunity.editor

import java.io.IOException
import kotlin.math.roundToInt

/** Current vertex coordinates in the ORIGINAL mesh-local coordinate system. */
data class VertexAxisAnchor(val x: Float, val y: Float, val z: Float)

/**
 * One finger gesture moves a selected POSITION vertex along one local axis.
 *
 * We intersect each camera ray with the selected axis in the least-squares
 * sense. This works with perspective/orthographic cameras, tilted views,
 * rotations and non-unit ray directions; no pixel-to-millimetre guesswork.
 *
 * If the axis is nearly parallel to the view ray, it is not observable on
 * screen. Reject the gesture rather than applying a wildly amplified offset.
 */
class VertexAxisDrag private constructor(
    private val anchor: VertexAxisAnchor,
    val axis: Int,
    val step: Float,
    private val startedAt: Double
) {
    companion object {
        fun begin(
            anchor: VertexAxisAnchor,
            axis: Int,
            step: Float,
            startRay: SurfaceRay
        ): VertexAxisDrag? {
            if (axis !in 0..2) throw IOException("Ось перемещения должна быть X, Y или Z.")
            if (!step.isFinite() || step !in .01f..1f)
                throw IOException("Недопустимый шаг перемещения вершины.")
            val at = coordinate(anchor, axis, startRay) ?: return null
            return VertexAxisDrag(anchor, axis, step, at)
        }

        /**
         * s is the closest coordinate on P + s*axis to the forward-facing ray
         * O + t*D. Solve two-line closest approach without assuming |D|=1.
         */
        private fun coordinate(p: VertexAxisAnchor, axis: Int, ray: SurfaceRay): Double? {
            val v = doubleArrayOf(
                p.x.toDouble(), p.y.toDouble(), p.z.toDouble(),
                ray.ox.toDouble(), ray.oy.toDouble(), ray.oz.toDouble(),
                ray.dx.toDouble(), ray.dy.toDouble(), ray.dz.toDouble()
            )
            if (v.any { !it.isFinite() }) return null
            val ox = v[3] - v[0]
            val oy = v[4] - v[1]
            val oz = v[5] - v[2]
            val dx = v[6]
            val dy = v[7]
            val dz = v[8]
            val dd = dx * dx + dy * dy + dz * dz
            if (dd < 1e-14 || !dd.isFinite()) return null
            val da = when (axis) {
                0 -> dx
                1 -> dy
                else -> dz
            }
            val aw = when (axis) {
                0 -> ox
                1 -> oy
                else -> oz
            }
            val dw = dx * ox + dy * oy + dz * oz
            val determinant = dd - da * da
            // sin(angle(ray, axis)) must be at least ~9 degrees.
            if (determinant <= dd * 0.025) return null
            val s = (dd * aw - da * dw) / determinant
            val t = (da * s - dw) / dd
            if (!s.isFinite() || !t.isFinite() || t < -1e-6) return null
            return s
        }
    }

    /** Quantized, bounded local offset; null means an unusable viewing angle. */
    fun delta(ray: SurfaceRay): Float? {
        val endpoint = coordinate(anchor, axis, ray) ?: return null
        val difference = endpoint - startedAt
        if (!difference.isFinite()) return null
        val bounded = difference.coerceIn(-3.0, 3.0)
        val snapped = (bounded / step.toDouble()).roundToInt() * step
        return snapped.coerceIn(-3f, 3f)
    }

    /** Returns one undoable modeling operation, or null for a zero-length drag. */
    fun move(mesh: Int, primitive: Int, vertex: Int, ray: SurfaceRay): VertexMove? {
        val d = delta(ray) ?: return null
        if (d == 0f) return null
        return when (axis) {
            0 -> VertexMove(mesh, primitive, vertex, d, 0f, 0f)
            1 -> VertexMove(mesh, primitive, vertex, 0f, d, 0f)
            else -> VertexMove(mesh, primitive, vertex, 0f, 0f, d)
        }.also { it.check() }
    }
}
