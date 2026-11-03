package com.wrcommunity.editor

import java.io.IOException

/**
 * Mirror a modeling brush around the midpoint of the selected material's
 * original bounding box, using the same 0..100 coordinates as GlbSculpt.
 *
 * 0 = off; 1 = local X; 2 = local Y; 3 = local Z.
 *
 * A reflected displacement normal to the mirror plane changes sign; a
 * tangential displacement retains it. An identical stroke on the plane is
 * emitted only once, otherwise it would double the applied deformation.
 *
 * This expands editing operations, not mesh topology: no extra vertices are
 * introduced and one finger path is one undo/redo action.
 */
object SculptSymmetry {
    fun expand(path: List<SculptStroke>, mirrorAxis: Int): List<SculptStroke> {
        if (mirrorAxis !in 0..3)
            throw IOException("Недопустимая ось симметрии.")
        path.forEach { it.check() }
        if (mirrorAxis == 0) return path.toList()

        val result = ArrayList<SculptStroke>(path.size * 2)
        for (stroke in path) {
            val reflected = when (mirrorAxis) {
                1 -> stroke.copy(
                    centerX = 100 - stroke.centerX,
                    axis = if (kotlin.math.abs(stroke.axis) == 1) -stroke.axis else stroke.axis
                )
                2 -> stroke.copy(
                    centerY = 100 - stroke.centerY,
                    axis = if (kotlin.math.abs(stroke.axis) == 2) -stroke.axis else stroke.axis
                )
                3 -> stroke.copy(
                    centerZ = 100 - stroke.centerZ,
                    axis = if (kotlin.math.abs(stroke.axis) == 3) -stroke.axis else stroke.axis
                )
                else -> stroke
            }
            result.add(stroke)
            if (reflected != stroke) result.add(reflected)
        }
        return result
    }
}
