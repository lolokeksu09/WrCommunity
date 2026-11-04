package com.wrcommunity.editor

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.file.Files

class EditorProjectLibraryTest {
    private fun draft(source: StoredModel, name: String, camera: String = "FRONT") =
        EditorDraft(source, name, ModelEdit(y = 45), setOf(0),
            emptyMap(), emptyList(), null, SculptStroke(0), camera)

    private suspend fun source(root: File, value: Int): StoredModel =
        EditorSessionStore.importSource(root, File(root, "in-$value.glb")
            .apply { writeBytes(ByteArray(48) { value.toByte() }) })

    @Test fun switchingPreservesBothModelsAndEditsAcrossRestart() = runBlocking {
        val root = Files.createTempDirectory("project-shelf").toFile()
        try {
            val first = source(root, 7)
            val a = draft(first, "First.glb")
            EditorSessionStore.save(root, a)
            val second = source(root, 8)
            val b = draft(second, "Second.glb", "LEFT")
            EditorSessionStore.save(root, b)
            assertTrue(first.file.exists())
            assertTrue(second.file.exists())
            val projects = EditorSessionStore.listProjects(root)
            assertEquals(2, projects.size)
            assertTrue(projects.any { it.name == "First.glb" && !it.active })
            assertTrue(projects.any { it.name == "Second.glb" && it.active })
            val restored = EditorSessionStore.activateProject(root, b, first.file.name)
            assertEquals("First.glb", restored.name)
            assertEquals("First.glb", EditorSessionStore.restore(root)!!.name)
            assertEquals(2, EditorSessionStore.listProjects(root).size)
            EditorSessionStore.activateProject(root, restored, second.file.name)
            assertEquals("LEFT", EditorSessionStore.restore(root)!!.camera)
        } finally { root.deleteRecursively() }
    }

    @Test fun latestUnsavedChangesPersistWhenSwitching() = runBlocking {
        val root = Files.createTempDirectory("project-switch-dirty").toFile()
        try {
            val a = draft(source(root, 14), "A.glb")
            val b = draft(source(root, 15), "B.glb")
            EditorSessionStore.save(root, a)
            EditorSessionStore.save(root, b)
            val editedB = b.copy(global = ModelEdit(moveX = 0.75f), camera = "BACK")
            EditorSessionStore.activateProject(root, editedB, a.source.file.name)
            val loadedB = EditorSessionStore.activateProject(root, a, b.source.file.name)
            assertEquals(editedB.global, loadedB.global)
            assertEquals("BACK", loadedB.camera)
        } finally { root.deleteRecursively() }
    }

    @Test fun staleAutosavesAfterSwitchCannotReplaceActiveProject() = runBlocking {
        val root = Files.createTempDirectory("project-pause-race").toFile()
        try {
            val a = draft(source(root, 22), "A.glb")
            val b = draft(source(root, 23), "B.glb")
            EditorSessionStore.save(root, a)
            EditorSessionStore.save(root, b)
            EditorSessionStore.activateProject(root, b, a.source.file.name)
            EditorSessionStore.saveCurrent(root, b.copy(camera = "TOP"))
            EditorSessionStore.saveWhenPaused(root, b.copy(camera = "RIGHT")).join()
            assertEquals("A.glb", EditorSessionStore.restore(root)!!.name)
            assertEquals("FRONT", EditorSessionStore.peekProject(root, b.source.file.name).camera)
        } finally { root.deleteRecursively() }
    }

    @Test fun corruptOrNonexistentProjectsCannotReplaceActiveSession() = runBlocking {
        val root = Files.createTempDirectory("project-corrupt").toFile()
        try {
            val a = draft(source(root, 30), "A.glb")
            val b = draft(source(root, 31), "B.glb")
            EditorSessionStore.save(root, a)
            EditorSessionStore.save(root, b)
            a.source.file.writeBytes(ByteArray(48) { 90.toByte() })
            for (bad in listOf(a.source.file.name, "../model-evil.glb",
                    "model-12345678-1234-1234-1234-123456789abc.glb")) {
                try {
                    EditorSessionStore.activateProject(root, b, bad)
                    fail("Invalid saved project activated: $bad")
                } catch (_: IOException) {}
            }
            assertEquals(b.source, EditorSessionStore.restore(root)!!.source)
        } finally { root.deleteRecursively() }
    }

    @Test fun checkpointsBelongToIndividualProjects() = runBlocking {
        val root = Files.createTempDirectory("project-checkpoints").toFile()
        try {
            val a = draft(source(root, 41), "A.glb")
            EditorSessionStore.save(root, a)
            EditorSessionStore.saveCheckpoint(root, a.copy(camera = "TOP"))
            val b = draft(source(root, 42), "B.glb")
            EditorSessionStore.save(root, b)
            assertNull(EditorSessionStore.readCheckpoint(root))
            EditorSessionStore.saveCheckpoint(root, b.copy(camera = "BACK"))
            EditorSessionStore.activateProject(root, b, a.source.file.name)
            assertEquals("TOP", EditorSessionStore.readCheckpoint(root)!!.camera)
            val original = EditorSessionStore.restoreCheckpoint(root)
            assertEquals("TOP", original.camera)
            EditorSessionStore.activateProject(root, original, b.source.file.name)
            assertEquals("BACK", EditorSessionStore.readCheckpoint(root)!!.camera)
        } finally { root.deleteRecursively() }
    }

    @Test fun deleteRequiresInactiveProjectAndPreservesActive() = runBlocking {
        val root = Files.createTempDirectory("project-delete").toFile()
        try {
            val a = draft(source(root, 51), "A.glb")
            val b = draft(source(root, 52), "B.glb")
            EditorSessionStore.save(root, a)
            EditorSessionStore.save(root, b)
            try {
                EditorSessionStore.deleteProject(root, b.source.file.name)
                fail("Active project deleted")
            } catch (_: IOException) {}
            assertTrue(b.source.file.exists())
            EditorSessionStore.deleteProject(root, a.source.file.name)
            assertFalse(a.source.file.exists())
            assertEquals(1, EditorSessionStore.listProjects(root).size)
            assertEquals(b.source, EditorSessionStore.restore(root)!!.source)
        } finally { root.deleteRecursively() }
    }

    @Test fun legacySingleProjectAppearsInLibraryWithoutMigrationLoss() = runBlocking {
        val root = Files.createTempDirectory("project-legacy").toFile()
        try {
            val a = draft(source(root, 61), "Legacy.glb")
            EditorSessionStore.save(root, a)
            val dir = File(EditorSessionStore.folder(root), "projects")
            dir.deleteRecursively()
            val projects = EditorSessionStore.listProjects(root)
            assertEquals(1, projects.size)
            assertEquals("Legacy.glb", projects.single().name)
            assertTrue(a.source.file.exists())
        } finally { root.deleteRecursively() }
    }

    @Test fun damagedInactiveProjectIsVisibleAndCanBeExplicitlyRemoved() = runBlocking {
        val root = Files.createTempDirectory("project-damaged-delete").toFile()
        try {
            val old = draft(source(root, 65), "Damaged.glb")
            val active = draft(source(root, 66), "Active.glb")
            EditorSessionStore.save(root, old)
            EditorSessionStore.save(root, active)
            old.source.file.writeBytes(ByteArray(20) { 0 })
            val entries = EditorSessionStore.listProjects(root)
            val damaged = entries.first { it.sourceFileName == old.source.file.name }
            assertTrue(damaged.damaged)
            assertFalse(damaged.active)
            try {
                EditorSessionStore.peekProject(root, damaged.sourceFileName)
                fail("Damaged project should not be opened")
            } catch (_: IOException) {}
            EditorSessionStore.deleteProject(root, damaged.sourceFileName)
            assertFalse(old.source.file.exists())
            assertEquals(active.source, EditorSessionStore.restore(root)!!.source)
        } finally { root.deleteRecursively() }
    }

    @Test fun recoveredBackupCanRepairCorruptedPrimaryWithoutSwitchingProjects() = runBlocking {
        val root = Files.createTempDirectory("project-repair").toFile()
        try {
            val a = draft(source(root, 90), "Repair.glb")
            EditorSessionStore.save(root, a)
            EditorSessionStore.save(root, a.copy(camera = "LEFT"))
            File(EditorSessionStore.folder(root), "draft.json").writeText("{broken")
            val recovered = EditorSessionStore.restoreWithStatus(root)!!
            assertTrue(recovered.fromBackup)
            EditorSessionStore.saveCurrent(root, recovered.draft.copy(camera = "TOP"))
            val repaired = EditorSessionStore.restoreWithStatus(root)!!
            assertFalse(repaired.fromBackup)
            assertEquals("TOP", repaired.draft.camera)
        } finally { root.deleteRecursively() }
    }

    @Test fun projectLimitRejectsNewImportWithoutDestroyingCurrent() = runBlocking {
        val root = Files.createTempDirectory("project-limit").toFile()
        try {
            repeat(EditorSessionStore.MAX_PROJECTS) { n ->
                val draft = draft(source(root, n + 70), "Project-$n.glb")
                EditorSessionStore.save(root, draft)
            }
            val current = EditorSessionStore.restore(root)!!
            val pending = source(root, 110)
            try {
                EditorSessionStore.commitImportedDraft(root, pending, "Over-limit.glb", setOf(0))
                fail("Project count limit bypassed")
            } catch (_: IOException) {}
            assertEquals(current.source, EditorSessionStore.restore(root)!!.source)
            assertEquals(EditorSessionStore.MAX_PROJECTS, EditorSessionStore.listProjects(root).size)
        } finally { root.deleteRecursively() }
    }
}
