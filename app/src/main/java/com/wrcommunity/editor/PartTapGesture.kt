package com.wrcommunity.editor

/** Short one-finger taps select; swipes and multitouch keep camera control. */
internal class PartTapGesture(private val touchSlop: Float) {
    private var startX = Float.NaN
    private var startY = Float.NaN
    private var eligible = false

    fun down(x: Float, y: Float, pointers: Int) {
        startX = x
        startY = y
        eligible = pointers == 1 && x.isFinite() && y.isFinite()
    }
    fun move(x: Float, y: Float, pointers: Int) {
        if (!eligible || pointers != 1 || !withinSlop(x, y)) eligible = false
    }
    fun up(x: Float, y: Float, pointers: Int): Boolean {
        val tapped = eligible && pointers == 1 && withinSlop(x, y)
        cancel()
        return tapped
    }
    fun cancel() {
        eligible = false
        startX = Float.NaN
        startY = Float.NaN
    }
    private fun withinSlop(x: Float, y: Float): Boolean {
        if (!x.isFinite() || !y.isFinite()) return false
        val dx = x - startX
        val dy = y - startY
        return dx * dx + dy * dy <= touchSlop * touchSlop
    }
}
