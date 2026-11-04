# 3D Editor v0.3.0

## Functional update

- Material-based layer browser with names and primitive counts read from GLB.
- Toggle visibility, isolate a single layer, show all; separate 50-step undo/redo history.
- Cannot hide every group. Reloaded previews come from an app-private copy of the GLB.
- Export a new GLB reflecting the chosen visible materials and existing global transforms.
- View camera presets: front, right, back, left and top.
- Preserve the applicationId `com.wrcommunity.editor.stable` and the existing permanent signing certificate.

## Guarantees and limits

Layer isolation is based on **material primitives**, not an anatomical or topological decomposition. For the user's character this allows observing hair/skin/suit/detail separately, but cannot yet move individual vertices or sculpt a face.

The exported GLB retains texture data and BIN chunk unchanged. Hidden primitives are not rendered; their raw backing data may remain in the file. The original user-supplied GLB is not mutated.

Automated tests cover parsing, isolation, data preservation, no-empty-selection, history and export transformation. UI and gesture quality on Lenovo Legion Y70 require real hardware verification.

When switching visibility, SceneView reloads a generated GLB and may show a short loading spinner. Camera view switches do not reload the source asset. Filters are only applied to materials actually present in the GLB.
