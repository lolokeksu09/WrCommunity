package com.wrcommunity.editor

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files

class GlbVertexEditorTest {
    private fun sample(shared: Boolean = true): ByteArray {
        val bin = ByteBuffer.allocate(72).order(ByteOrder.LITTLE_ENDIAN)
        listOf(0f,0f,0f, 1f,0f,0f, 0f,1f,0f,
            0f,0f,1f, 0f,0f,1f, 0f,0f,1f).forEach(bin::putFloat)
        val other = if (shared) 0 else 0
        val json = """{"asset":{"version":"2.0"},"buffers":[{"byteLength":72}],
            "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36},
                           {"buffer":0,"byteOffset":36,"byteLength":36}],
            "accessors":[
                {"bufferView":0,"componentType":5126,"type":"VEC3",
                 "count":3,"min":[0,0,0],"max":[1,1,0]},
                {"bufferView":1,"componentType":5126,"type":"VEC3","count":3}],
            "materials":[{"name":"A"},{"name":"B"}],
            "meshes":[{"primitives":[
                {"attributes":{"POSITION":$other,"NORMAL":1},"material":0},
                {"attributes":{"POSITION":0,"NORMAL":1},"material":1}
            ]}],"nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}"""
        val b = json.toByteArray(Charsets.UTF_8)
        val padded = (b.size + 3) and -4
        return ByteBuffer.allocate(20 + padded + 8 + bin.capacity())
            .order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + padded + 8 + bin.capacity())
            .putInt(padded).putInt(0x4E4F534A).put(b)
            .apply { repeat(padded-b.size) { put(32.toByte()) } }
            .putInt(bin.capacity()).putInt(0x004E4942).put(bin.array()).array()
    }

    private fun position(data: ByteArray, primitive: Int, vertex: Int, axis: Int): Float {
        val input = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
        val jsonLength = input.getInt(12)
        val root = JSONObject(String(data, 20, jsonLength).trim())
        val prim = root.getJSONArray("meshes").getJSONObject(0)
            .getJSONArray("primitives").getJSONObject(primitive)
        val accessor = root.getJSONArray("accessors")
            .getJSONObject(prim.getJSONObject("attributes").getInt("POSITION"))
        val view = root.getJSONArray("bufferViews")
            .getJSONObject(accessor.getInt("bufferView"))
        val start = 28 + jsonLength + view.optInt("byteOffset", 0) +
            accessor.optInt("byteOffset", 0) + vertex*12 + axis*4
        return input.getFloat(start)
    }

    @Test fun targetedVertexMovesAndSharedAccessorsAreNotMutated() {
        val source = sample()
        val edited = GlbVertexEditor.apply(source, listOf(
            VertexMove(mesh=0, primitive=0, vertex=1, dx=0.25f, dy=-0.1f, dz=0.5f)
        ))
        assertEquals(1.25f, position(edited, 0, 1, 0), 1e-6f)
        assertEquals(-0.1f, position(edited, 0, 1, 1), 1e-6f)
        assertEquals(0.5f, position(edited, 0, 1, 2), 1e-6f)
        assertEquals(1f, position(edited, 1, 1, 0), 1e-6f)
        assertEquals(0f, position(edited, 1, 1, 2), 1e-6f)
        assertEquals(0f, position(edited, 0, 0, 0), 1e-6f)
        assertArrayEquals(sample(), source)
        GlbIntegrity.validate(edited)
    }

    @Test fun repeatedNudgesAddAndOneUndoRemovesOnlyLastOperation() {
        val one = VertexMove(0,0,2,0.1f,0f,0f)
        val two = VertexMove(0,0,2,0f,0.2f,0f)
        val history = VertexHistory().add(one).add(two)
        assertEquals(2, history.current.size)
        assertEquals(listOf(one), history.undo().current)
        assertEquals(listOf(one, two), history.undo().redo().current)
        val out = GlbVertexEditor.apply(sample(), history.current)
        assertEquals(.1f, position(out,0,2,0), 1e-6f)
        assertEquals(1.2f, position(out,0,2,1), 1e-6f)
    }

    @Test fun invalidIndexOrNonFiniteOffsetDoesNotModifySource() {
        val source = sample()
        val invalid = listOf(
            VertexMove(0,0,3,0.1f,0f,0f),
            VertexMove(0,3,0,0.1f,0f,0f),
            VertexMove(8,0,0,0.1f,0f,0f),
            VertexMove(0,0,1,Float.NaN,0f,0f),
            VertexMove(0,0,1,9f,0f,0f)
        )
        for (move in invalid) {
            try {
                GlbVertexEditor.apply(source, listOf(move))
                fail("Invalid vertex edit accepted: $move")
            } catch (_: IOException) {}
            assertArrayEquals(sample(), source)
        }
    }

    @Test fun unsupportedSkinMorphAndAnimationFailClosed() {
        val original = sample()
        val jsonLen = ByteBuffer.wrap(original).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val root = JSONObject(String(original,20,jsonLen).trim())
        val move = listOf(VertexMove(0,0,1,0.1f,0f,0f))
        for (feature in listOf("skins", "animations")) {
            val altered = GlbLayers.rewriteJson(original, JSONObject(root.toString())
                .put(feature, org.json.JSONArray().put(JSONObject())))
            try {
                GlbVertexEditor.apply(altered, move)
                fail("Unsupported rigged model accepted: $feature")
            } catch (_: IOException) {}
        }
        val morph = JSONObject(root.toString())
        morph.getJSONArray("meshes").getJSONObject(0).getJSONArray("primitives")
            .getJSONObject(0).put("targets", org.json.JSONArray().put(JSONObject()))
        try {
            GlbVertexEditor.apply(GlbLayers.rewriteJson(original, morph), move)
            fail("Morph model accepted")
        } catch (_: IOException) {}
    }

    @Test fun vertexTargetsAndPersistentDraftRoundTrip() = runBlocking {
        val rootDir = Files.createTempDirectory("vertex-editor").toFile()
        try {
            val file = File(rootDir, "model.glb").apply { writeBytes(sample()) }
            val options = GlbVertexEditor.targets(file)
            assertEquals(2, options.size)
            assertEquals(3, options[0].vertices)
            assertEquals(0, options[0].materialId)
            assertEquals(1, options[1].materialId)
            val source = EditorSessionStore.importSource(rootDir, file)
            val history = VertexHistory().add(VertexMove(0,0,2,0.1f,0.2f,-0.3f))
            val draft = EditorDraft(
                source = source, name = "Demo", global = ModelEdit(),
                visible = setOf(0,1), parts = emptyMap(), strokes = emptyList(),
                selected = 0, brush = SculptStroke(0), camera = "FRONT",
                vertexMoves = history.current
            )
            EditorSessionStore.save(rootDir, draft)
            assertEquals(history.current, EditorSessionStore.restore(rootDir)!!.vertexMoves)
            val legacy = JSONObject(draft.encode().toString())
            legacy.remove("vertexMoves")
            assertTrue(EditorDraft.decode(legacy, EditorSessionStore.folder(rootDir)).vertexMoves.isEmpty())
        } finally { rootDir.deleteRecursively() }
    }
}
