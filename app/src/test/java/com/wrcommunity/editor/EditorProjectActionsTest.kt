package com.wrcommunity.editor

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.file.Files

/** A fork owns a distinct GLB and draft; rename changes metadata, not source paths. */
class EditorProjectActionsTest {
    private suspend fun model(root: File, seed: Int, name: String): EditorDraft {
        val input = File(root, "source-$seed.glb").apply {
            writeBytes(ByteArray(48) { seed.toByte() })
        }
        val stored = EditorSessionStore.importSource(root, input)
        return EditorDraft(stored, name,
            ModelEdit(y=35, moveX=0.45f, scalePercent=125),
            setOf(-1), emptyMap(),
            listOf(SculptStroke(-1, centerX=24)),
            -1, SculptStroke(-1, centerY=62), "LEFT")
    }

    @Test fun forkCreatesIndependentEditableProjectWithoutChangingActiveDraft() = runBlocking {
        val root = Files.createTempDirectory("editor-fork").toFile()
        try {
            val original = model(root, 23, "Original.glb")
            EditorSessionStore.save(root, original)
            val fork = EditorSessionStore.duplicateProject(root, original.source.file.name, "Experiment.glb")
            val active = EditorSessionStore.restore(root)!!
            assertEquals(original, active)
            assertEquals("Experiment.glb", fork.name)
            assertNotEquals(original.source.file, fork.source.file)
            assertArrayEquals(original.source.file.readBytes(), fork.source.file.readBytes())
            assertEquals(original.source.sha256, fork.source.sha256)
            assertEquals(original.global, fork.global)
            assertEquals(original.strokes, fork.strokes)
            assertEquals(original.camera, fork.camera)
            assertEquals(2, EditorSessionStore.listProjects(root).size)

            // Editing the clone must not touch the original model or draft.
            val opened = EditorSessionStore.activateProject(root, original, fork.source.file.name)
            assertEquals(fork, opened)
            EditorSessionStore.saveCurrent(root, opened.copy(global = ModelEdit(moveZ=1.5f)))
            val restoredOriginal = EditorSessionStore.activateProject(
                root, EditorSessionStore.restore(root)!!, original.source.file.name)
            assertEquals(original.global, restoredOriginal.global)
        } finally { root.deleteRecursively() }
    }

    @Test fun forkAlsoCopiesManualCheckpointAsAnIndependentSnapshot() = runBlocking {
        val root = Files.createTempDirectory("editor-fork-checkpoint").toFile()
        try {
            val original = model(root, 33, "Original.glb")
            EditorSessionStore.save(root, original)
            EditorSessionStore.saveCheckpoint(root, original.copy(camera = "TOP"))
            val fork = EditorSessionStore.duplicateProject(root, original.source.file.name, "Fork.glb")
            assertEquals("TOP", EditorSessionStore.readCheckpoint(root)!!.camera)
            EditorSessionStore.activateProject(root, original, fork.source.file.name)
            assertEquals("TOP", EditorSessionStore.readCheckpoint(root)!!.camera)
            val saved = EditorSessionStore.restoreCheckpoint(root)
            assertEquals(fork.source, saved.source)
            assertEquals("TOP", saved.camera)
        } finally { root.deleteRecursively() }
    }

    @Test fun renameActivePersistsAndOldPausedSnapshotCannotUndoNewName() = runBlocking {
        val root = Files.createTempDirectory("editor-rename-current").toFile()
        try {
            val draft = model(root, 35, "Before.glb")
            EditorSessionStore.save(root, draft)
            val renamed = EditorSessionStore.renameProject(root, draft.source.file.name, "After.glb")
            assertEquals("After.glb", renamed.name)
            assertEquals("After.glb", EditorSessionStore.restore(root)!!.name)
            EditorSessionStore.saveWhenPaused(root, draft.copy(camera = "TOP")).join()
            assertEquals("After.glb", EditorSessionStore.restore(root)!!.name)
            assertEquals("After.glb", EditorSessionStore.peekProject(root, draft.source.file.name).name)
        } finally { root.deleteRecursively() }
    }

    @Test fun renameInactiveKeepsActiveSessionAndCheckpoint() = runBlocking {
        val root = Files.createTempDirectory("editor-rename-inactive").toFile()
        try {
            val a = model(root, 40, "One.glb")
            EditorSessionStore.save(root, a)
            EditorSessionStore.saveCheckpoint(root, a.copy(camera="TOP"))
            val b = model(root, 41, "Two.glb")
            EditorSessionStore.save(root, b)
            val renamed = EditorSessionStore.renameProject(root, a.source.file.name, "My Character")
            assertEquals("My Character", renamed.name)
            assertEquals(b, EditorSessionStore.restore(root))
            EditorSessionStore.activateProject(root, b, a.source.file.name)
            assertEquals("My Character", EditorSessionStore.restore(root)!!.name)
            assertEquals("My Character", EditorSessionStore.readCheckpoint(root)!!.name)
        } finally { root.deleteRecursively() }
    }

    @Test fun invalidTitlesAreRejectedAndDoNotChangeOriginal() = runBlocking {
        val root = Files.createTempDirectory("editor-invalid-title").toFile()
        try {
            val active = model(root, 51, "Safe")
            EditorSessionStore.save(root, active)
            for (bad in listOf("", "   ", "a".repeat(161), "Bad\nName", "\u0000")) {
                try {
                    EditorSessionStore.renameProject(root, active.source.file.name, bad)
                    fail("Invalid rename: $bad")
                } catch (_: IOException) {}
                try {
                    EditorSessionStore.duplicateProject(root, active.source.file.name, bad)
                    fail("Invalid fork: $bad")
                } catch (_: IOException) {}
            }
            assertEquals("Safe", EditorSessionStore.restore(root)!!.name)
            assertEquals(1, EditorSessionStore.listProjects(root).size)
        } finally { root.deleteRecursively() }
    }

    @Test fun fullLibraryOrTamperedSourceMustNotProducePartialFork() = runBlocking {
        val root = Files.createTempDirectory("editor-fork-capacity").toFile()
        try {
            repeat(EditorSessionStore.MAX_PROJECTS) { i ->
                EditorSessionStore.save(root, model(root, i+60, "Model-$i"))
            }
            val active = EditorSessionStore.restore(root)!!
            try {
                EditorSessionStore.duplicateProject(root, active.source.file.name, "Over limit")
                fail("Library limit bypassed")
            } catch (_: IOException) {}
            assertEquals(EditorSessionStore.MAX_PROJECTS, EditorSessionStore.listProjects(root).size)
            assertEquals(active, EditorSessionStore.restore(root))

            // A changed source must not be trusted for a fork.
            active.source.file.writeBytes(ByteArray(48) { 3 })
            try {
                EditorSessionStore.duplicateProject(root, active.source.file.name, "Tampered")
                fail("Broken GLB forked")
            } catch (_: IOException) {}
            assertEquals(EditorSessionStore.MAX_PROJECTS, EditorSessionStore.listProjects(root).size)
        } finally { root.deleteRecursively() }
    }
}
