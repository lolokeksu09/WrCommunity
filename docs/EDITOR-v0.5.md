# 3D Editor v0.5 — controlled sculpting

Feature: local vertex deformation of a material primitive (X/Y/Z normalized center, sphere radius, axis, strength). After selecting a material in **Слои → Править → Форма**, set a region and press **Применить деформацию**.

The tool copies affected glTF POSITION accessor values into a fresh BIN bufferView and leaves original geometry untouched, including meshes sharing an accessor across materials. Supports FLOAT VEC3 (including strided view); no sparse, compressed, skinned or animated meshes. It preserves original textures and other binary attributes. The user can Undo/Redo or reset strokes. The exporter applies sculpt strokes, group transforms, then global transforms when saving a new GLB.

Deliberate limits: **not** direct finger painting, vertex picking, dynamic topology, retopology or smoothing. Original normals are not recalculated yet, so large deformations may display lighting artifacts. 20 strokes max. Limit GLB to 150MB; additional positions increase file size. 3D preview reloads the changed GLB.

QA: unit tests for isolated material, shared accessor safety, 20-stroke undo limit, invalid parameter rejection, GLB chunk consistency; Android CI; physical Lenovo Legion Y70 still to be checked. Stable package stays `com.wrcommunity.editor.stable`; never re-sign with a different key. No original user GLB is overwritten.
