# 3D Editor Stable v0.9.0 — repeatable precise brush

## Goal

Fix two functional limitations from v0.8: accurate brush ray casting stopped after the first successful sculpt, and the entire finger path could only be undone one waypoint at a time.

## Behavior

- When the visible GLB changes (sculpt, undo/redo, visibility), `GlbSurfacePicker` is rebuilt from the **current preview file**, not the original import. POSITION buffer changes are therefore picked using current triangles.
- A picker is only enabled if its source location and the attached SceneView ModelNode's location match the displayed model. This guards stale hit tests and changes during load.
- When a different model, visible-material selection or active editing target supersedes an async hit test, its result is discarded.
- The path is one atomic history operation using `SculptHistory.addPath`. Undo removes all points in that gesture; Redo restores all. An invalid or oversized path is rejected without modifying history.
- All existing 20-stroke, 50-history-step limits remain. On complex node transforms or unsupported scenes, manual editing still works.
- The exact brush is disabled for separate material group transforms, since world/local transforms for those groups need further handling. After regular sculpt, the picker refreshes and can be used again.

## Verification

- Unit tests for path transaction, history branch/redo, and previous/next geometry picking.
- Existing GLB import/export, normal recalculation and material isolation tests.
- Local validation of user files: both Character_Improved.glb and Character_Refined_v2.glb are 1 scene/1 node with FLOAT VEC3 TRIANGLES, approx. 360,577 triangles, within the parser cap.
- Requires Android CI for exact revision, applicationId/version and stable signing certificate verification; hardware gestures on Lenovo Legion Y70 still to be verified.

No overwrite of original GLB. No deployment, server, or database changes. applicationId `com.wrcommunity.editor.stable`, versionName 0.9.0, versionCode 14.
