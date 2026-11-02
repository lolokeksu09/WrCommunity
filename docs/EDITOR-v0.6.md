# 3D Editor v0.6.0 — Sculpt shading correctness

## Change

The `GlbSculpt` pipeline now recalculates NORMAL vectors after local edits to glTF POSITION vertices. For each affected TRIANGLES primitive:

1. Read original indices (UNSIGNED_BYTE / UNSIGNED_SHORT / UNSIGNED_INT), or sequential vertices for non-indexed triangles.
2. Calculate area-weighted face normals from the **deformed** positions.
3. Accumulate and normalize one vertex normal per POSITION index.
4. Create **new**, tightly packed NORMAL accessor and BIN bufferView. Other primitives keep their original normals, geometry and textures.
5. Preserve existing normals for unreferenced/degenerate vertices.

The original GLB is never overwritten. This is an *algorithmic normals fix*, not a normal-map painter or topology editor.

## Safety / supported cases

- FLOAT VEC3 POSITION and NORMAL, valid indexed or nonindexed triangles.
- If an edited primitive has TANGENT, nontriangle mode, invalid indices, compressed/sparse normals, or lacks consistent bounds, abort with an explicit error rather than producing incorrect lighting.
- Animated, skinned and morph-target meshes still unsupported for sculpting.
- No 3D screen-ray selection yet. The existing `Форма` controls remain unchanged.

## Verification

- New JUnit `GlbNormalsTest`: changed normals, unchanged other material, unchanged original BIN prefix, invalid indices, unsupported mode and tangent.
- Existing JUnit suite must remain green.
- Manual metadata inspection against both real character GLBs: TRIANGLES indexed primitives with POSITION/NORMAL, without TANGENT.
- Android CI builds APK from exact SHA; source model preview and lighting on Lenovo Legion Y70 remain **device verification pending**.
- `applicationId=com.wrcommunity.editor.stable`, `versionCode=11`. Use the same signing certificate as v0.5.0.

Project Workflow Standard v1.4-rc3 applies. Do not merge/release without the required checks.
