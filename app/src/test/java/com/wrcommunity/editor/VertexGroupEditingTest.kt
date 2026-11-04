package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class VertexGroupEditingTest {
    @Test fun selectedVerticesMoveTogetherInOneUndoRedoTransaction() {
        val moves = VertexGroupEdits.moves(
            mesh=0, primitive=2, vertices=setOf(3,1,2),
            dx=.1f, dy=0f, dz=-.2f,
            vertexCount=10, historyCount=0
        )
        assertEquals(listOf(1,2,3), moves.map { it.vertex })
        assertEquals(3, moves.size)
        assertTrue(moves.all { it.dx == .1f && it.dz == -.2f })
        val applied = VertexHistory().addGroup(moves)
        assertEquals(3, applied.current.size)
        assertTrue(applied.canUndo)
        assertEquals(emptyList<VertexMove>(), applied.undo().current)
        assertEquals(moves, applied.undo().redo().current)
    }

    @Test fun groupEditsRejectInvalidIndicesWithoutChangingHistory() {
        val history = VertexHistory().add(VertexMove(0, 0, 1, .1f, 0f, 0f))
        for (bad in listOf(setOf(-1), setOf(999), emptySet<Int>())) {
            try {
                VertexGroupEdits.moves(0,0,bad,.1f,0f,0f,10,history.current.size)
                fail("Bad group was accepted: $bad")
            } catch (_: IOException) { }
            assertEquals(1, history.current.size)
        }
        try {
            VertexGroupEdits.moves(0,0,setOf(1,2),Float.NaN,0f,0f,10,0)
            fail("NaN group offset accepted")
        } catch (_: IOException) { }
        try {
            history.addGroup(listOf(VertexMove(0,0,1,.1f,0f,0f),
                VertexMove(0,0,1,.1f,0f,0f)))
            fail("Duplicated target accepted")
        } catch (_: IOException) { }
    }

    @Test fun exceeding64MoveBudgetFailsAtomicallyRatherThanApplyingPart() {
        val full = VertexHistory().addGroup((0..61).map {
            VertexMove(0,0,it,.01f,0f,0f)
        })
        assertEquals(62, full.current.size)
        val excess = VertexGroupEdits.moves(0,0,setOf(63,64,65),
            .1f,0f,0f,100,full.current.size)
        // Producing a plan is pure; the actual history commit refuses it.
        try {
            full.addGroup(excess)
            fail("Partial group append would violate the 64-move limit")
        } catch (_: IOException) { }
        assertEquals(62, full.current.size)
        assertEquals(0, full.index)
    }

    @Test fun addingAfterUndoDiscardsRedoAsOneAtomicGroup() {
        val h1 = VertexHistory().add(VertexMove(0,0,1,.1f,0f,0f))
            .add(VertexMove(0,0,2,.1f,0f,0f))
        val group = VertexGroupEdits.moves(0,0,setOf(2,3),
            0f,.2f,0f,10,h1.undo().current.size)
        val changed = h1.undo().addGroup(group)
        assertFalse(changed.canRedo)
        assertEquals(listOf(1,2,3), changed.current.map { it.vertex })
        assertEquals(listOf(1), changed.undo().current.map { it.vertex })
    }

    @Test fun emptyAndMixedPrimitiveGroupsAreRejected() {
        try { VertexHistory().addGroup(emptyList()); fail("Empty group") }
        catch (_: IOException) { }
        try {
            VertexHistory().addGroup(listOf(
                VertexMove(0,0,1,.1f,0f,0f),
                VertexMove(0,1,2,.1f,0f,0f)))
            fail("Mixed primitives in single group")
        } catch (_: IOException) { }
    }
}
