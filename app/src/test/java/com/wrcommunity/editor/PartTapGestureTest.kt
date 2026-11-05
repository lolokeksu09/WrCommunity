package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test

class PartTapGestureTest {
    @Test fun shortTapSelectsAndSwipeDoesNot() {
        val gesture = PartTapGesture(9f)
        gesture.down(40f,50f,1)
        gesture.move(43f,55f,1)
        assertTrue(gesture.up(43f,55f,1))
        gesture.down(40f,50f,1)
        gesture.move(60f,51f,1)
        assertFalse(gesture.up(40f,50f,1))
    }
    @Test fun multiTouchCancelAndBadCoordinatesDoNotSelect() {
        val gesture = PartTapGesture(9f)
        gesture.down(0f,0f,1)
        gesture.move(0f,0f,2)
        assertFalse(gesture.up(0f,0f,1))
        gesture.down(0f,0f,1)
        gesture.cancel()
        assertFalse(gesture.up(0f,0f,1))
        gesture.down(0f,0f,1)
        assertFalse(gesture.up(Float.NaN,0f,1))
    }
}
