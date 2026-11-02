package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

class GlbIntegrityTest {
    private fun sample(): ByteArray {
        val json = """{"asset":{"version":"2.0"},"buffers":[{"byteLength":4}],
            "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":4}],
            "accessors":[{"bufferView":0,"count":1,"type":"SCALAR","componentType":5126}],
            "meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],
            "nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],"scene":0}"""
        val raw=json.toByteArray()
        val len=(raw.size + 3) and -4
        return ByteBuffer.allocate(20+len+12).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20+len+12)
            .putInt(len).putInt(0x4E4F534A).put(raw)
            .apply { repeat(len-raw.size){ put(32.toByte()) } }
            .putInt(4).putInt(0x004E4942).putInt(0).array()
    }

    @Test fun validGlbAndTransformAreAccepted() {
        val original=sample()
        GlbIntegrity.validate(original)
        GlbIntegrity.validate(GlbTransformExporter.transform(original,ModelEdit(y=30)))
    }

    @Test fun shortenedBinChunkIsRejectedEvenWithUpdatedFileHeader() {
        val bytes=sample().copyOf(sample().size-4)
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putInt(8,bytes.size)
        try { GlbIntegrity.validate(bytes); fail("truncated BIN accepted") }
        catch (_: IOException) { }
    }

    @Test fun corruptedBufferViewIsRejected() {
        val source=sample()
        val length=ByteBuffer.wrap(source).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val json=org.json.JSONObject(String(source,20,length).trim())
        json.getJSONArray("bufferViews").getJSONObject(0).put("byteLength",1000)
        val changed=GlbLayers.rewriteJson(source,json)
        try { GlbIntegrity.validate(changed); fail("out-of-bounds bufferView accepted") }
        catch (_: IOException) { }
    }

    @Test fun danglingNodeReferenceIsRejected() {
        val source=sample()
        val length=ByteBuffer.wrap(source).order(ByteOrder.LITTLE_ENDIAN).getInt(12)
        val json=org.json.JSONObject(String(source,20,length).trim())
        json.getJSONArray("scenes").getJSONObject(0).put("nodes",org.json.JSONArray().put(99))
        val changed=GlbLayers.rewriteJson(source,json)
        try { GlbIntegrity.validate(changed); fail("dangling root node accepted") }
        catch (_: IOException) { }
    }
}
