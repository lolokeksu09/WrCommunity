package com.wrcommunity.editor

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class EditorProjectArchiveTest {
    private fun sampleGlb(): ByteArray {
        val json = """{"asset":{"version":"2.0"},"buffers":[{"byteLength":4}],
            "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":4}],
            "accessors":[{"bufferView":0,"count":1,"type":"SCALAR","componentType":5126}],
            "meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],
            "nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}"""
        val bytes = json.toByteArray()
        val padded = (bytes.size + 3) and -4
        return ByteBuffer.allocate(20 + padded + 12).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + padded + 12)
            .putInt(padded).putInt(0x4E4F534A).put(bytes)
            .apply { repeat(padded - bytes.size) { put(32.toByte()) } }
            .putInt(4).putInt(0x004E4942).putInt(0).array()
    }

    private suspend fun project(root: File): EditorDraft {
        val imported = File(root, "source.glb").apply { writeBytes(sampleGlb()) }
        val source = EditorSessionStore.importSource(root, imported)
        val draft = EditorDraft(source, "Test.glb",
            ModelEdit(y = 45, moveX = .25f, scalePercent = 125),
            setOf(-1), mapOf(-1 to PartEdit(x = .1f)),
            listOf(SculptStroke(-1, centerX = 24, strength = 3)),
            -1, SculptStroke(-1, centerY = 64), "RIGHT")
        EditorSessionStore.save(root, draft)
        return draft
    }

    private fun zip(vararg entries: Pair<String, ByteArray>): ByteArray =
        ByteArrayOutputStream().also { bytes ->
            ZipOutputStream(bytes).use { stream ->
                for ((name, content) in entries) {
                    stream.putNextEntry(ZipEntry(name))
                    stream.write(content)
                    stream.closeEntry()
                }
            }
        }.toByteArray()

    @Test fun exportedProjectRestoresAllEditsAndOriginalGlb() = runBlocking {
        val first = Files.createTempDirectory("archive-export").toFile()
        val second = Files.createTempDirectory("archive-import").toFile()
        try {
            val original = project(first)
            val bytes = ByteArrayOutputStream()
            EditorProjectArchive.write(bytes, original)
            val imported = EditorProjectArchive.import(second, ByteArrayInputStream(bytes.toByteArray()))
            val restored = EditorSessionStore.restore(second)!!
            assertEquals(original.name, restored.name)
            assertEquals(original.global, restored.global)
            assertEquals(original.visible, restored.visible)
            assertEquals(original.parts, restored.parts)
            assertEquals(original.strokes, restored.strokes)
            assertEquals(original.selected, restored.selected)
            assertEquals(original.brush, restored.brush)
            assertEquals(original.camera, restored.camera)
            assertEquals(original.source.sha256, imported.source.sha256)
            assertArrayEquals(original.source.file.readBytes(), restored.source.file.readBytes())
            assertNotEquals(original.source.file.path, restored.source.file.path)
        } finally {
            first.deleteRecursively()
            second.deleteRecursively()
        }
    }

    @Test fun corruptModelHashPreservesCurrentlyOpenedProject() = runBlocking {
        val root = Files.createTempDirectory("archive-invalid-hash").toFile()
        try {
            val old = project(root)
            val broken = zip("model.glb" to sampleGlb().apply { this[lastIndex] = 5 },
                "draft.json" to old.encode().toString().toByteArray())
            try {
                EditorProjectArchive.import(root, ByteArrayInputStream(broken))
                fail("Changed model with old SHA must not be imported")
            } catch (_: IOException) {}
            assertEquals(old.source.sha256, EditorSessionStore.restore(root)!!.source.sha256)
            assertTrue(old.source.file.isFile)
        } finally { root.deleteRecursively() }
    }

    @Test fun zipSlipAndExtraEntriesAreRejectedBeforeCommit() = runBlocking {
        val root = Files.createTempDirectory("archive-slip").toFile()
        try {
            val old = project(root)
            for (name in listOf("../evil.glb", "project/other.glb", "junk.txt")) {
                val malicious = zip(name to byteArrayOf(1, 2, 3),
                    "model.glb" to sampleGlb(),
                    "draft.json" to old.encode().toString().toByteArray())
                try {
                    EditorProjectArchive.import(root, ByteArrayInputStream(malicious))
                    fail("Unexpected entry accepted: $name")
                } catch (_: IOException) {}
            }
            assertEquals(old.source.sha256, EditorSessionStore.restore(root)!!.source.sha256)
        } finally { root.deleteRecursively() }
    }

    @Test fun missingOrDuplicateEntriesAreRejected() = runBlocking {
        val root = Files.createTempDirectory("archive-missing").toFile()
        try {
            val old = project(root)
            val manifest = old.encode().toString().toByteArray()
            for (invalid in listOf(
                zip("draft.json" to manifest),
                zip("model.glb" to sampleGlb()),
                zip("model.glb" to sampleGlb(), "model.glb" to sampleGlb(), "draft.json" to manifest)
            )) {
                try {
                    EditorProjectArchive.import(root, ByteArrayInputStream(invalid))
                    fail("Malformed archive accepted")
                } catch (_: IOException) {}
            }
            assertEquals(old.source.sha256, EditorSessionStore.restore(root)!!.source.sha256)
        } finally { root.deleteRecursively() }
    }

    @Test fun badModelLayerReferencesAreRejectedWithoutReplacingDraft() = runBlocking {
        val root = Files.createTempDirectory("archive-invalid-layer").toFile()
        try {
            val old = project(root)
            val broken = JSONObject(old.encode().toString())
                .put("visible", org.json.JSONArray().put(123))
            val archive = zip("draft.json" to broken.toString().toByteArray(),
                "model.glb" to sampleGlb())
            try {
                EditorProjectArchive.import(root, ByteArrayInputStream(archive))
                fail("Unknown material layer must be rejected")
            } catch (_: IOException) {}
            assertEquals(old.source.sha256, EditorSessionStore.restore(root)!!.source.sha256)
        } finally { root.deleteRecursively() }
    }

    @Test fun incompleteArchiveCannotReplaceSavedProject() = runBlocking {
        val root = Files.createTempDirectory("archive-truncated").toFile()
        try {
            val old = project(root)
            val bytes = ByteArrayOutputStream().also {
                EditorProjectArchive.write(it, old)
            }.toByteArray()
            try {
                EditorProjectArchive.import(root, ByteArrayInputStream(bytes.copyOf(bytes.size / 2)))
                fail("Truncated archive must be rejected")
            } catch (_: IOException) {}
            assertEquals(old.source.sha256, EditorSessionStore.restore(root)!!.source.sha256)
        } finally { root.deleteRecursively() }
    }
}
