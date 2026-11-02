package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbSculptTest {
    private fun glb(shared: Boolean = false): ByteArray {
        val bin=ByteBuffer.allocate(72).order(ByteOrder.LITTLE_ENDIAN)
        listOf(0f,0f,0f, 1f,0f,0f, 0f,1f,0f,
            0f,0f,2f, 1f,0f,2f, 0f,1f,2f).forEach {bin.putFloat(it)}
        val a1=if(shared) 0 else 1
        val doc="""{"asset":{"version":"2.0"},"buffers":[{"byteLength":72}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36},{"buffer":0,"byteOffset":36,"byteLength":36}],"accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"},{"bufferView":1,"componentType":5126,"count":3,"type":"VEC3"}],"materials":[{"name":"Skin"},{"name":"Hair"}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"material":0},{"attributes":{"POSITION":$a1},"material":1}]}],"nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}"""
        val j=doc.toByteArray()
        val padded=(j.size+3) and -4
        return ByteBuffer.allocate(20+padded+8+bin.capacity()).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20+padded+8+bin.capacity())
            .putInt(padded).putInt(0x4E4F534A).put(j)
            .apply { repeat(padded-j.size){put(32.toByte())} }
            .putInt(72).putInt(0x004E4942).put(bin.array()).array()
    }
    private fun root(bytes:ByteArray): JSONObject {
        val len=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        return JSONObject(String(bytes,20,len).trim())
    }

    @Test fun identityUnchanged() {
        val bytes=glb()
        assertArrayEquals(bytes,GlbSculpt.apply(bytes,emptyList()))
    }

    @Test fun editsOneMaterialWithoutChangingOriginalBytes() {
        val src=glb()
        val modified=GlbSculpt.apply(src,listOf(
            SculptStroke(0,centerX=0,centerY=0,centerZ=0,radius=100,axis=3,strength=10)))
        val parts=root(modified).getJSONArray("meshes").getJSONObject(0).getJSONArray("primitives")
        val a=parts.getJSONObject(0).getJSONObject("attributes").getInt("POSITION")
        val b=parts.getJSONObject(1).getJSONObject("attributes").getInt("POSITION")
        assertEquals(1,b)
        assertTrue(a>=2)
        val priorStart=28+ByteBuffer.wrap(src).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val resultStart=28+ByteBuffer.wrap(modified).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        assertArrayEquals(src.copyOfRange(priorStart,priorStart+72),
            modified.copyOfRange(resultStart,resultStart+72))
        val accessor=root(modified).getJSONArray("accessors").getJSONObject(a)
        val view=root(modified).getJSONArray("bufferViews").getJSONObject(accessor.getInt("bufferView"))
        val start=resultStart+view.getInt("byteOffset")
        val v=ByteBuffer.wrap(modified).order(ByteOrder.LITTLE_ENDIAN).getFloat(start+8)
        assertTrue("sculpt should change z",v>0.01f)
        assertNull(GlbValidation.error(modified.copyOfRange(0,20),modified.size.toLong()))
        assertArrayEquals(glb(),src)
    }

    @Test fun sharedPositionAccessorGetsPrivateCopy() {
        val out=GlbSculpt.apply(glb(true),listOf(SculptStroke(0,radius=100)))
        val p=root(out).getJSONArray("meshes").getJSONObject(0).getJSONArray("primitives")
        assertNotEquals(0,p.getJSONObject(0).getJSONObject("attributes").getInt("POSITION"))
        assertEquals(0,p.getJSONObject(1).getJSONObject("attributes").getInt("POSITION"))
    }

    @Test fun invalidParamsAndUndoHistory() {
        try {SculptStroke(0,axis=0).check();fail("invalid axis accepted")}
        catch (_:IOException) {}
        var h=SculptHistory()
        val a=SculptStroke(0)
        repeat(20){h=h.add(a)}
        assertEquals(19,h.undo().current.size)
        assertEquals(20,h.undo().redo().current.size)
        try {h.add(a);fail("expected bound")}catch (_:IOException){}
        assertEquals(0,h.reset().current.size)
    }

    @Test fun rejectsMissingMaterial() {
        try {GlbSculpt.apply(glb(),listOf(SculptStroke(42)));fail("material not found")}
        catch (_:IOException) {}
    }
    @Test fun splitMaterialUsesSharedBoundsNotIndependentPrimitiveCenters() {
        val bin = ByteBuffer.allocate(72).order(ByteOrder.LITTLE_ENDIAN)
        listOf(0f,0f,0f, 1f,0f,0f, 0f,1f,0f,
            10f,0f,0f, 11f,0f,0f, 10f,1f,0f).forEach { bin.putFloat(it) }
        val json = """{"asset":{"version":"2.0"},"buffers":[{"byteLength":72}],
            "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36},
                {"buffer":0,"byteOffset":36,"byteLength":36}],
            "accessors":[{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3",
                "min":[0,0,0],"max":[1,1,0]},
                {"bufferView":1,"componentType":5126,"count":3,"type":"VEC3",
                "min":[10,0,0],"max":[11,1,0]}],
            "materials":[{}],"meshes":[{"primitives":[
                {"attributes":{"POSITION":0},"material":0},
                {"attributes":{"POSITION":1},"material":0}]}],
            "nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}"""
        val raw = json.toByteArray()
        val pad = (raw.size + 3) and -4
        val input = ByteBuffer.allocate(20 + pad + 8 + 72).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + pad + 8 + 72)
            .putInt(pad).putInt(0x4E4F534A).put(raw)
            .apply { repeat(pad - raw.size) { put(32.toByte()) } }
            .putInt(72).putInt(0x004E4942).put(bin.array()).array()
        val output = GlbSculpt.apply(input, listOf(SculptStroke(
            materialId=0, centerX=5, centerY=0, centerZ=50,
            radius=5, axis=3, strength=10)))
        val doc = root(output)
        val parts = doc.getJSONArray("meshes").getJSONObject(0).getJSONArray("primitives")
        val accessors = doc.getJSONArray("accessors")
        val views = doc.getJSONArray("bufferViews")
        val data = ByteBuffer.wrap(output).order(ByteOrder.LITTLE_ENDIAN)
        val start = 28 + data.getInt(12)
        fun zOf(primitive: Int, vertex: Int): Float {
            val accessorId = parts.getJSONObject(primitive).getJSONObject("attributes").getInt("POSITION")
            val acc = accessors.getJSONObject(accessorId)
            val view = views.getJSONObject(acc.getInt("bufferView"))
            return data.getFloat(start + view.getInt("byteOffset") + vertex * 12 + 8)
        }
        assertTrue("near group should deform", zOf(0, 1) > 0.01f)
        assertEquals("remote group should be untouched", 0f, zOf(1, 1), 1e-6f)
    }

}
