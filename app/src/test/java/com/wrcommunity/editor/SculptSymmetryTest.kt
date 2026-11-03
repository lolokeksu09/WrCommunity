package com.wrcommunity.editor

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import kotlinx.coroutines.runBlocking

class SculptSymmetryTest {
    @Test fun mirrorXFlipsCenterAndDirectedXDisplacement() {
        val stroke = SculptStroke(materialId = 2, centerX = 20, centerY = 35,
            centerZ = 60, radius = 25, axis = 1, strength = 7)
        val mirrored = SculptSymmetry.expand(listOf(stroke), 1)
        assertEquals(2, mirrored.size)
        assertEquals(stroke, mirrored[0])
        assertEquals(stroke.copy(centerX = 80, axis = -1), mirrored[1])
    }

    @Test fun mirrorYAndZOnlyFlipNormalDisplacement() {
        val y = SculptStroke(0, centerY = 25, axis = -2)
        assertEquals(y.copy(centerY = 75, axis = 2),
            SculptSymmetry.expand(listOf(y), 2)[1])
        val z = SculptStroke(0, centerZ = 15, axis = 2)
        assertEquals(z.copy(centerZ = 85, axis = 2),
            SculptSymmetry.expand(listOf(z), 3)[1])
        val zNormal = SculptStroke(0, centerZ = 30, axis = -3)
        assertEquals(zNormal.copy(centerZ = 70, axis = 3),
            SculptSymmetry.expand(listOf(zNormal), 3)[1])
    }

    @Test fun brushOnPlaneIsNotAppliedTwiceForTangentialMotion() {
        val seam = SculptStroke(0, centerX = 50, axis = 3, strength = 8)
        val expanded = SculptSymmetry.expand(listOf(seam), 1)
        assertEquals(listOf(seam), expanded)
        val normal = seam.copy(axis = 1)
        val expected = listOf(normal, normal.copy(axis = -1))
        assertEquals(expected, SculptSymmetry.expand(listOf(normal), 1))
    }

    @Test fun wholeMirroredPathIsOneUndoStepAndOverflowDoesNotChangeHistory() {
        val path = listOf(
            SculptStroke(0, centerX = 20, centerZ = 40),
            SculptStroke(0, centerX = 25, centerZ = 45)
        )
        val sym = SculptSymmetry.expand(path, 1)
        assertEquals(4, sym.size)
        val changed = SculptHistory().addPath(sym)
        assertEquals(4, changed.current.size)
        assertTrue(changed.canUndo)
        assertTrue(changed.undo().current.isEmpty())
        assertEquals(sym, changed.undo().redo().current)
        val almostFull = SculptHistory().addPath(List(18) { SculptStroke(0) })
        try {
            almostFull.addPath(SculptSymmetry.expand(path, 1))
            fail("Mirrored brush path must obey the 20-deformation limit")
        } catch (_: IOException) { }
        assertEquals(18, almostFull.current.size)
    }

    @Test fun invalidSymmetryAxisFailsBeforeMutation() {
        val first = SculptStroke(0)
        for (axis in listOf(-1, 4, Int.MIN_VALUE)) {
            try {
                SculptSymmetry.expand(listOf(first), axis)
                fail("Unknown symmetry axis accepted: $axis")
            } catch (_: IOException) { }
        }
        assertEquals(listOf(first), SculptSymmetry.expand(listOf(first), 0))
    }

    @Test fun symmetrySettingRoundTripAndLegacyDefault() = runBlocking {
        val root = Files.createTempDirectory("symmetry-draft").toFile()
        try {
            val glb = File(root, "input.glb").apply { writeBytes(ByteArray(48) { 19 }) }
            val source = EditorSessionStore.importSource(root, glb)
            val draft = EditorDraft(
                source = source, name = "Sculpt.glb", global = ModelEdit(),
                visible = setOf(0), parts = emptyMap(), strokes = emptyList(),
                selected = 0, brush = SculptStroke(0), camera = "FRONT",
                symmetryAxis = 2
            )
            EditorSessionStore.save(root, draft)
            assertEquals(2, EditorSessionStore.restore(root)!!.symmetryAxis)
            val legacy = JSONObject(draft.encode().toString())
            legacy.remove("symmetryAxis")
            assertEquals(0, EditorDraft.decode(legacy, EditorSessionStore.folder(root)).symmetryAxis)
        } finally { root.deleteRecursively() }
    }

    private fun symmetricGlb(): ByteArray {
        val verts = ByteBuffer.allocate(36).order(ByteOrder.LITTLE_ENDIAN)
        listOf(-1f, 0f, 0f, 1f, 0f, 0f, 0f, 1f, 0f)
            .forEach(verts::putFloat)
        val json = """{"asset":{"version":"2.0"},"buffers":[{"byteLength":36}],
            "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36}],
            "accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3",
                "min":[-1,0,0],"max":[1,1,0]}],
            "meshes":[{"primitives":[{"attributes":{"POSITION":0},"material":0}]}],
            "materials":[{}],"nodes":[{"mesh":0}],
            "scenes":[{"nodes":[0]}],"scene":0}"""
        val raw = json.toByteArray(Charsets.UTF_8)
        val padded = (raw.size + 3) and -4
        return ByteBuffer.allocate(20 + padded + 8 + 36).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + padded + 8 + 36)
            .putInt(padded).putInt(0x4E4F534A).put(raw)
            .apply { repeat(padded - raw.size) { put(32.toByte()) } }
            .putInt(36).putInt(0x004E4942).put(verts.array()).array()
    }

    @Test fun mirroredSculptProducesEqualPhysicalDeformationsOnBothSides() {
        val source = symmetricGlb()
        val stroke = SculptStroke(0, centerX = 0, centerY = 0,
            centerZ = 50, radius = 35, axis = 3, strength = 8)
        val out = GlbSculpt.apply(source, SculptSymmetry.expand(listOf(stroke), 1))
        val jsonLen = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val root = JSONObject(String(out, 20, jsonLen).trim())
        val primitive = root.getJSONArray("meshes").getJSONObject(0)
            .getJSONArray("primitives").getJSONObject(0)
        val posId = primitive.getJSONObject("attributes").getInt("POSITION")
        val accessor = root.getJSONArray("accessors").getJSONObject(posId)
        val view = root.getJSONArray("bufferViews")
            .getJSONObject(accessor.getInt("bufferView"))
        val binStart = 28 + jsonLen
        val start = binStart + view.getInt("byteOffset") + accessor.optInt("byteOffset", 0)
        val data = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
        val zLeft = data.getFloat(start + 8)
        val zRight = data.getFloat(start + 20)
        assertTrue(zLeft > 0.001f)
        assertEquals(zLeft, zRight, 1e-5f)
        assertArrayEquals(symmetricGlb(), source)
        GlbIntegrity.validate(out)
    }
}
