# 3D Editor Stable v0.11.0 — verified GLB export

## Fixed

Previously, successful `ContentResolver.openOutputStream(...).write(...)` could result in a success message even if an external Storage Access Framework provider truncated or changed the written file.

New export pipeline:

1. Apply material visibility, sculpt strokes, part transforms and global transforms in memory.
2. Validate GLB JSON header, chunk boundaries, embedded BIN length, bufferView range, accessor references, node and scene references, and primitive attribute references.
3. Write a **new** target GLB with SAF mode `wt` (write with truncation) and close the stream.
4. Reopen the saved document for reading; calculate SHA-256 incrementally, and compare its length and digest with the output bytes.
5. Report success only when the target bytes were read back and matched exactly. Any read error, altered data, short write or invalid structure results in a visible error.

The user's source GLB remains unchanged. On provider failure, the newly created destination document can remain incomplete: do not use it until the export is retried. Some providers may refuse reopen/readback; the app reports verification failure rather than false success.

## Tests

- `GlbIntegrityTest`: valid GLB with transformation, truncated BIN with matching total header, out-of-range bufferView, invalid scene root.
- Existing unit suite, Project Workflow Standard, Android build on exact commit.
- Readback on user device / provider, exporting and reopening both large character GLBs, is an outstanding hardware check.
- Package remains `com.wrcommunity.editor.stable`; versionCode 16; sign with the same stable keystore as v0.10.0.
