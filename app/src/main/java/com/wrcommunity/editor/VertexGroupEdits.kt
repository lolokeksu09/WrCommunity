package com.wrcommunity.editor

import java.io.IOException

/** Safe, deterministic plan for moving multiple vertices in one primitive. */
object VertexGroupEdits {
    const val MAX_SELECTION = 64

    fun moves(
        mesh: Int,
        primitive: Int,
        vertices: Set<Int>,
        dx: Float, dy: Float, dz: Float,
        vertexCount: Int,
        historyCount: Int
    ): List<VertexMove> {
        if (vertexCount !in 1..1_000_000 || historyCount !in 0..64 ||
            vertices.isEmpty() || vertices.size > MAX_SELECTION)
            throw IOException("Недопустимое количество выделенных вершин.")
        if (vertices.any { it !in 0 until vertexCount })
            throw IOException("Выделение содержит отсутствующие вершины.")
        if (historyCount + vertices.size > 64)
            throw IOException("Недостаточно места в истории: нужно ${vertices.size}, " +
                "доступно ${64-historyCount}. Уменьши выделение или сохрани GLB.")
        return vertices.sorted().map { index ->
            VertexMove(mesh, primitive, index, dx, dy, dz).also { it.check() }
        }
    }
}
