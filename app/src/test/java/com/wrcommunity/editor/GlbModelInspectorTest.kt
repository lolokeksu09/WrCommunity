package com.wrcommunity.editor

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files

class GlbModelInspectorTest {
    private fun glb(json: String): ByteArray {
        val raw = json.toByteArray(Charsets.UTF_8)
        val padded = (raw.size + 3) and -4
        return ByteBuffer.allocate(20 + padded + 12).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(0x46546C67).putInt(2).putInt(20 + padded + 12)
            .putInt(padded).putInt(0x4E4F534A).put(raw)
            .apply { repeat(padded - raw.size) { put(32.toByte()) } }
            .putInt(4).putInt(0x004E4942).putInt(0).array()
    }

    @Test fun triangulationAndTextureCountsAreCorrectForIndexedAndUnindexedGeometry() {
        val json = """{
          "asset":{"version":"2.0"},
          "accessors":[
            {"type":"VEC3","count":4}, {"type":"SCALAR","count":6},
            {"type":"VEC3","count":5}, {"type":"VEC3","count":4},
            {"type":"VEC3","count":4}, {"type":"SCALAR","count":6}
          ],
          "meshes":[{"primitives":[
            {"attributes":{"POSITION":0},"indices":1,"mode":4,"material":0},
            {"attributes":{"POSITION":2},"mode":5,"material":0},
            {"attributes":{"POSITION":3},"mode":6,"material":0},
            {"attributes":{"POSITION":4},"indices":5,"mode":1,"material":0}
          ]}],
          "nodes":[{"mesh":0},{"mesh":0}],
          "scenes":[{"nodes":[0,1]}],
          "materials":[{"name":"coat"}],
          "textures":[{}],"images":[{}]
        }"""
        val input = Files.createTempFile("model-stat", ".glb").toFile()
        try {
            input.writeBytes(glb(json))
            val report = GlbModelInspector.inspect(input)
            assertEquals(1, report.meshes)
            assertEquals(4, report.primitives)
            assertEquals(2, report.nodes)
            assertEquals(1, report.scenes)
            assertEquals(1, report.materials)
            assertEquals(1, report.textures)
            assertEquals(1, report.images)
            assertEquals(17L, report.vertexReferences)
            assertEquals(7L, report.triangles)
            assertEquals(1, report.nonTrianglePrimitives)
            assertEquals(0, report.unknownGeometryPrimitives)
            assertEquals(input.length(), report.bytes)
        } finally { input.delete() }
    }

    @Test fun defaultTrianglesModeAndMeshInstancingNotDoubleCounted() {
        val input = Files.createTempFile("model-simple", ".glb").toFile()
        try {
            input.writeBytes(glb("""{"asset":{"version":"2.0"},
             "accessors":[{"count":3,"type":"VEC3"}],
             "meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],
             "nodes":[{"mesh":0},{"mesh":0},{"mesh":0}],
             "scenes":[{"nodes":[0,1,2]}]}"""))
            val stats = GlbModelInspector.inspect(input)
            assertEquals(1L, stats.triangles)
            assertEquals(3L, stats.vertexReferences)
            assertEquals(3, stats.nodes)
            assertTrue(stats.warnings.isEmpty())
        } finally { input.delete() }
    }

    @Test fun skinAnimationAndMorphTargetsProduceActionableWarnings() {
        val input = Files.createTempFile("model-rigged", ".glb").toFile()
        try {
            input.writeBytes(glb("""{"asset":{"version":"2.0"},
            "accessors":[{"count":3,"type":"VEC3"}],
            "meshes":[{"weights":[0.5],"primitives":[{
               "attributes":{"POSITION":0},"targets":[{"POSITION":0}]}]}],
            "nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}],
            "animations":[{}],"skins":[{}]}"""))
            val report = GlbModelInspector.inspect(input)
            assertEquals(1, report.animations)
            assertEquals(1, report.skins)
            assertEquals(1, report.morphTargets)
            assertTrue(report.warnings.any { it.contains("скелет") })
            assertTrue(report.warnings.any { it.contains("Morph") })
        } finally { input.delete() }
    }

    @Test fun invalidAccessorDoesNotInventTriangleCount() {
        val input = Files.createTempFile("model-incomplete", ".glb").toFile()
        try {
            input.writeBytes(glb("""{"asset":{"version":"2.0"},
              "accessors":[{"count":3,"type":"VEC3"}],
              "meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":99}]}],
              "nodes":[{"mesh":0}],"scenes":[{"nodes":[0]}]}"""))
            val report = GlbModelInspector.inspect(input)
            assertEquals(0L, report.triangles)
            assertEquals(1, report.unknownGeometryPrimitives)
            assertTrue(report.warnings.any { it.contains("неполным") })
        } finally { input.delete() }
    }

    @Test fun malformedHeaderOrTruncatedJsonIsRejected() {
        val input = Files.createTempFile("model-broken", ".glb").toFile()
        try {
            input.writeBytes(byteArrayOf(1, 2, 3))
            try {
                GlbModelInspector.inspect(input)
                fail("Truncated file accepted")
            } catch (_: IOException) {}
            val valid = glb("""{"asset":{"version":"2.0"}}""")
            ByteBuffer.wrap(valid).order(ByteOrder.LITTLE_ENDIAN).putInt(8, valid.size + 4)
            input.writeBytes(valid)
            try {
                GlbModelInspector.inspect(input)
                fail("Incorrect GLB length accepted")
            } catch (_: IOException) {}
        } finally { input.delete() }
    }
}
