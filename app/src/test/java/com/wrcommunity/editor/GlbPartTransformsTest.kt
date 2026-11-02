package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbPartTransformsTest {
    private fun fixture(animated: Boolean = false): ByteArray {
        val doc = """{"asset":{"version":"2.0"},"materials":[{"name":"Skin"},{"name":"Hair"}],"meshes":[{"name":"Body","primitives":[{"attributes":{"POSITION":0},"material":0},{"attributes":{"POSITION":1},"material":1}]}],"nodes":[{"mesh":0,"name":"Character"}],"scenes":[{"nodes":[0]}],"scene":0}"""
        val str = if (animated) doc.dropLast(1) + ""","animations":[{}]}""" else doc
        val bytes = str.toByteArray()
        val n = (bytes.size + 3) and -4
        return ByteBuffer.allocate(20+n+12).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20+n+12)
            .putInt(n).putInt(0x4E4F534A).put(bytes)
            .apply { repeat(n-bytes.size) { put(32.toByte()) } }
            .putInt(4).putInt(0x004E4942).put(byteArrayOf(1,2,3,4)).array()
    }

    private fun json(glb: ByteArray): JSONObject {
        val len = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        return JSONObject(String(glb,20,len).trim())
    }

    @Test fun keepsIdentityBitForBit() {
        val b=fixture()
        assertArrayEquals(b,GlbPartTransforms.apply(b,emptyMap()))
        assertArrayEquals(b,GlbPartTransforms.apply(b,mapOf(0 to PartEdit())))
    }

    @Test fun partTransformsPreserveBuffersAndOtherGroups() {
        val b=fixture()
        val c=GlbPartTransforms.apply(b,mapOf(1 to PartEdit(x=.1f,rotationY=15,scalePercent=120)))
        val d=json(c)
        val nodes=d.getJSONArray("nodes")
        val meshes=d.getJSONArray("meshes")
        assertFalse(nodes.getJSONObject(0).has("mesh"))
        assertEquals(2,nodes.getJSONObject(0).getJSONArray("children").length())
        val skin=nodes.getJSONObject(1)
        val hair=nodes.getJSONObject(2)
        assertFalse(skin.has("translation"))
        assertEquals(.1,hair.getJSONArray("translation").getDouble(0),.000001)
        assertEquals(1.2,hair.getJSONArray("scale").getDouble(0),.000001)
        val m=meshes.getJSONObject(hair.getInt("mesh"))
        assertEquals(1,m.getJSONArray("primitives").getJSONObject(0).getInt("material"))
        assertArrayEquals(b.takeLast(12).toByteArray(),c.takeLast(12).toByteArray())
        assertNull(GlbValidation.error(c.copyOfRange(0,20),c.size.toLong()))
    }

    @Test fun editsCanBeExportedWithGlobalTransform() {
        val part=GlbPartTransforms.apply(fixture(),mapOf(0 to PartEdit(y=.05f)))
        val all=GlbTransformExporter.transform(part,ModelEdit(y=30))
        assertTrue(json(all).getJSONArray("nodes").length()>3)
        assertArrayEquals(fixture().takeLast(12).toByteArray(),all.takeLast(12).toByteArray())
    }

    @Test fun rejectsUnsupportedAnimationSafely() {
        try { GlbPartTransforms.apply(fixture(true),mapOf(1 to PartEdit(y=.1f)))
            fail("unsupported animations should be rejected")
        } catch (_: IOException) { }
    }

    @Test fun undoRedoAndResetParts() {
        val a=PartHistory().change(1,PartEdit(x=.02f)).change(1,PartEdit(x=.04f))
        assertEquals(.02f,a.undo().current[1]!!.x,0.00001f)
        assertEquals(.04f,a.undo().redo().current[1]!!.x,0.00001f)
        assertFalse(a.undo().change(1,PartEdit(x=.06f)).canRedo)
        assertTrue(a.reset().current.isEmpty())
    }

    @Test fun rejectOutOfRangeInput() {
        try { PartEdit(x=Float.NaN).check();fail("NaN accepted") } catch (_: IOException) { }
        try { PartEdit(scalePercent=0).check();fail("Scale zero accepted") } catch (_: IOException) { }
    }
}
