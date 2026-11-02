package com.wrcommunity.editor

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.file.Files

class EditorSessionStoreTest {
    private fun draft(source: StoredModel): EditorDraft = EditorDraft(
        source = source,
        name = "Character_Improved.glb",
        global = ModelEdit(y=45, moveX=.25f, scalePercent=125),
        visible = setOf(0,2,4),
        parts = mapOf(2 to PartEdit(x=.1f,rotationY=15)),
        strokes = listOf(SculptStroke(4,centerX=26,radius=40,axis=-2)),
        selected = 4,
        brush = SculptStroke(4,centerY=75,strength=8),
        camera = "RIGHT"
    )

    @Test fun autosaveAndRestoreRoundTripWithModelVerification() = runBlocking {
        val root=Files.createTempDirectory("editor-draft-test").toFile()
        try {
            val imported=File(root,"imported.glb")
            imported.writeBytes(ByteArray(40) { (it * 5).toByte() })
            val source=EditorSessionStore.importSource(root,imported)
            val saved=draft(source)
            EditorSessionStore.save(root,saved)
            val restored=EditorSessionStore.restore(root)!!
            assertEquals(saved.name,restored.name)
            assertEquals(saved.global,restored.global)
            assertEquals(saved.visible,restored.visible)
            assertEquals(saved.parts,restored.parts)
            assertEquals(saved.strokes,restored.strokes)
            assertEquals(saved.brush,restored.brush)
            assertEquals(saved.selected,restored.selected)
            assertEquals(saved.camera,restored.camera)
            assertEquals(source.sha256,restored.source.sha256)
            assertArrayEquals(imported.readBytes(),restored.source.file.readBytes())
        } finally { root.deleteRecursively() }
    }

    @Test fun pauseFlushPersistsNewestEditsWithoutWaitingForDebounce() = runBlocking {
        val root = Files.createTempDirectory("editor-draft-pause").toFile()
        try {
            val input = File(root, "phone.glb").apply { writeBytes(ByteArray(48) { it.toByte() }) }
            val source = EditorSessionStore.importSource(root, input)
            val initial = draft(source)
            EditorSessionStore.save(root, initial)
            val justEdited = initial.copy(
                global = initial.global.copy(moveX = 0.75f),
                camera = "BACK"
            )
            EditorSessionStore.saveWhenPaused(root, justEdited).join()
            val restored = EditorSessionStore.restore(root)!!
            assertEquals(justEdited.global, restored.global)
            assertEquals("BACK", restored.camera)
            assertNull(EditorSessionStore.backgroundSaveError())
        } finally { root.deleteRecursively() }
    }

    @Test fun failedPauseFlushKeepsLastGoodDraft() = runBlocking {
        val root = Files.createTempDirectory("editor-draft-pause-error").toFile()
        try {
            val input = File(root, "good.glb").apply { writeBytes(ByteArray(48) { 7 }) }
            val source = EditorSessionStore.importSource(root, input)
            EditorSessionStore.save(root, draft(source))
            val missing = StoredModel(File(source.file.parentFile, "model-" +
                java.util.UUID.randomUUID() + ".glb"), 48, source.sha256)
            EditorSessionStore.saveWhenPaused(root, draft(missing)).join()
            assertNotNull(EditorSessionStore.backgroundSaveError())
            assertEquals(source.sha256, EditorSessionStore.restore(root)!!.source.sha256)
        } finally { root.deleteRecursively() }
    }

    @Test fun oldDraftSaveDoesNotDeleteAJustImportedUncommittedModel() = runBlocking {
        val root = Files.createTempDirectory("editor-pending-import").toFile()
        try {
            val first = EditorSessionStore.importSource(root,
                File(root, "first.glb").apply { writeBytes(ByteArray(40) { 1 }) })
            EditorSessionStore.save(root, draft(first))
            val pending = EditorSessionStore.importSource(root,
                File(root, "second.glb").apply { writeBytes(ByteArray(40) { 2 }) })
            // Re-saving the previous session may race with this new, uncommitted import.
            EditorSessionStore.save(root, draft(first))
            assertTrue("Uncommitted import must survive a stale autosave", pending.file.isFile)
            EditorSessionStore.save(root, draft(pending))
            assertEquals(pending.sha256, EditorSessionStore.restore(root)!!.source.sha256)
            assertFalse("Previous committed source can now be reclaimed", first.file.exists())
        } finally { root.deleteRecursively() }
    }

    @Test fun delayedPauseFlushCannotReplaceNewerCommittedSnapshot() = runBlocking {
        val root = Files.createTempDirectory("editor-save-order").toFile()
        try {
            val source = EditorSessionStore.importSource(root,
                File(root, "model.glb").apply { writeBytes(ByteArray(48) { 3 }) })
            val earlier = draft(source)
            val newest = earlier.copy(global = earlier.global.copy(moveZ = 0.91f))
            val pendingFlush = EditorSessionStore.saveWhenPaused(root, earlier)
            EditorSessionStore.save(root, newest)
            pendingFlush.join()
            assertEquals(newest.global, EditorSessionStore.restore(root)!!.global)
        } finally { root.deleteRecursively() }
    }

    @Test fun modifiedSourceIsNeverSilentlyRestored() = runBlocking {
        val root=Files.createTempDirectory("editor-draft-hash").toFile()
        try {
            val imported=File(root,"model.glb")
            imported.writeBytes(ByteArray(40){(it*3).toByte()})
            val source=EditorSessionStore.importSource(root,imported)
            EditorSessionStore.save(root,draft(source))
            val tampered=source.file.readBytes()
            tampered[5]=(tampered[5].toInt() xor 1).toByte()
            source.file.writeBytes(tampered)
            try {
                EditorSessionStore.restore(root)
                fail("Changed source must not be restored")
            } catch (_: IOException) {}
        } finally { root.deleteRecursively() }
    }

    @Test fun maliciousPathAndOversizedStrokeHistoryAreRejected() {
        val root=Files.createTempDirectory("editor-draft-invalid").toFile()
        try {
            val file=File(root,"editor-session/model-12345678-1234-1234-1234-123456789abc.glb")
            file.parentFile!!.mkdirs()
            file.writeBytes(ByteArray(40))
            val sample=draft(StoredModel(file,40,"a".repeat(64))).encode()
            sample.put("file","../../private.glb")
            try { EditorDraft.decode(sample,file.parentFile!!);fail("Path traversal accepted") }
            catch (_: IOException) {}
            sample.put("file",file.name)
            val tooMany=org.json.JSONArray()
            repeat(21){tooMany.put(JSONObject().put("id",1).put("x",50).put("y",50)
                .put("z",50).put("radius",30).put("axis",2).put("strength",4))}
            sample.put("strokes",tooMany)
            try {EditorDraft.decode(sample,file.parentFile!!);fail("Unbounded stroke history accepted")}
            catch (_: IOException) {}
        } finally { root.deleteRecursively() }
    }

    @Test fun replacementDoesNotDeleteEarlierDraftUntilNewMetadataSaved() = runBlocking {
        val root=Files.createTempDirectory("editor-draft-switch").toFile()
        try {
            val imported=File(root,"a.glb").apply { writeBytes(ByteArray(32){1}) }
            val first=EditorSessionStore.importSource(root,imported)
            EditorSessionStore.save(root,draft(first))
            val second=EditorSessionStore.importSource(root,
                File(root,"b.glb").apply {writeBytes(ByteArray(40){2})})
            assertTrue(first.file.exists())
            assertTrue(second.file.exists())
            assertEquals(first.sha256,EditorSessionStore.restore(root)!!.source.sha256)
            EditorSessionStore.save(root,draft(second))
            assertFalse(first.file.exists())
            assertEquals(second.sha256,EditorSessionStore.restore(root)!!.source.sha256)
        } finally { root.deleteRecursively() }
    }
}
