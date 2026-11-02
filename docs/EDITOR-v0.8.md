# 3D Editor Stable v0.8.0 — triangle-level sculpt brush targeting

## What changed

- Precise Möller–Trumbore ray/triangle intersection against the glTF triangle mesh, not SceneView's approximate collision shape.
- Ray transformed into the model's local coordinates via SceneView ModelNode.
- Nearest hit checked across all visible material groups: a covered/hidden material is not painted through another visible material.
- One-finger tap selects a surface point; a one-finger swipe collects up to 12 sampled surface points. Geometry **is not changed until confirmation** in the Form panel.
- Explicit `Применить путь` and `Очистить путь` for pending strokes; existing independent undo/redo and GLB export are reused.
- Model CPU data is decoded off the main thread and reused; ray intersections run on Dispatchers.Default after gesture release.
- Failed/unsupported ray tracing falls back to the previous manual coordinate-based sculpt controls.

## Safe bounds

- At most 2 million indexed triangles, one scene/one untransformed mesh node, embedded BIN, FLOAT VEC3 POSITION, indexed TRIANGLES (u8/u16/u32) or non-indexed.
- The exact picker requires an **unmodified** current mesh. It is disabled once sculpt strokes or independent part transforms are present, until reset. This avoids painting at stale coordinates.
- 12 sampled hits per gesture; the global sculpt history still limits to 20 strokes.
- On-device CPU raycast latency depends on mesh density (the user's character GLBs contain hundreds of thousands of triangles). Long strokes may take time to resolve. No geometry changes until the user accepts.
- No direct vertex selection, topology changes, or painting textures. Original user GLB is never overwritten.

## Verification

- Unit tests: closest indexed triangle, material occlusion, out-of-bounds/NaN, invalid index and unsupported transformed node.
- All existing Project Workflow Standard tests and Android build.
- Smoke test on both character GLBs after import, including preloading performance and output reopened in the viewer, still requires a physical device.

Package `com.wrcommunity.editor.stable`, versionCode 13, versionName 0.8.0. Sign with the **same** previously used Stable certificate.
