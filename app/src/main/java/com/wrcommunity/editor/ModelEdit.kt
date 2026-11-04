package com.wrcommunity.editor

import kotlin.math.cos
import kotlin.math.sin

/** User edits in the model's own coordinates (never the preview camera transform). */
data class ModelEdit(
    val x: Int = 0,
    val y: Int = 0,
    val z: Int = 0,
    val moveX: Float = 0f,
    val moveY: Float = 0f,
    val moveZ: Float = 0f,
    val scalePercent: Int = 100
) {
    val isIdentity get() = x == 0 && y == 0 && z == 0 &&
        moveX == 0f && moveY == 0f && moveZ == 0f && scalePercent == 100

    /** glTF stores rotations as xyzw quaternions, whereas UI works in degrees. */
    fun quaternion(): FloatArray {
        val rx = Math.toRadians(x.toDouble()) * .5
        val ry = Math.toRadians(y.toDouble()) * .5
        val rz = Math.toRadians(z.toDouble()) * .5
        val cx = cos(rx); val sx = sin(rx)
        val cy = cos(ry); val sy = sin(ry)
        val cz = cos(rz); val sz = sin(rz)
        return floatArrayOf(
            (sx * cy * cz - cx * sy * sz).toFloat(),
            (cx * sy * cz + sx * cy * sz).toFloat(),
            (cx * cy * sz - sx * sy * cz).toFloat(),
            (cx * cy * cz + sx * sy * sz).toFloat()
        )
    }
}

/** Small bounded undo history. New edits after undo discard the redo branch. */
data class EditHistory(
    val steps: List<ModelEdit> = listOf(ModelEdit()),
    val index: Int = 0
) {
    val current: ModelEdit get() = steps[index]
    val canUndo get() = index > 0
    val canRedo get() = index < steps.lastIndex
    fun change(next: ModelEdit): EditHistory {
        if (next == current) return this
        val branch = steps.take(index + 1).takeLast(49) + next
        return EditHistory(branch, branch.lastIndex)
    }
    fun undo() = if (canUndo) copy(index = index - 1) else this
    fun redo() = if (canRedo) copy(index = index + 1) else this
}
