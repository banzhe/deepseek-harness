# Tool-FS basePath directory confinement

- Kind: requirement
- Status: local
- Identifying paths:
  - packages/fs/tool-fs/src/apply-patch.ts
  - packages/fs/tool-fs/src/base-path.ts
  - packages/fs/tool-fs/src/edit.ts
  - packages/fs/tool-fs/src/index.ts
  - packages/fs/tool-fs/src/patch/index.ts
  - packages/fs/tool-fs/src/patch/plan.ts
  - packages/fs/tool-fs/src/patch/preflight.ts
  - packages/fs/tool-fs/src/patch/types.ts
  - packages/fs/tool-fs/src/read-image.ts
  - packages/fs/tool-fs/src/read-target.ts
  - packages/fs/tool-fs/src/read.ts
  - packages/fs/tool-fs/src/session-cwd.ts
  - packages/fs/tool-fs/src/write.ts
  - packages/fs/tool-fs/tests/base-path.spec.ts
  - packages/fs/tool-fs/tests/patch/harness.ts
  - packages/fs/tool-fs/tests/read-image.spec.ts
- Unique strings or tests:
  - `PathScope`
  - `basePath?: string`
  - `is outside the configured basePath`
  - `read accepts a basePath-relative path, a Session path carrying the prefix, and an absolute path`
  - `an out-of-range write is refused even when the call asks for wider sandbox permissions`
  - `creates a not-yet-existing basePath directory on first write`

## Intent

Add an optional `basePath?: string` configuration field to `@deepseek-ai/dsh-tool-fs` so a tool instance confines `read`, `read_image`, `write`, `edit`, and `apply_patch` (including move destinations) to one directory resolved against the Session working directory. Out-of-range paths, parent-climbing escapes, and sibling prefix lookalikes fail with `FS_PERMISSION_DENIED` before any provider read or mutation and cannot be bypassed via `sandbox_permissions`.

## Already-on-master test

Search the base for `PathScope` and the `basePath` configuration field in `packages/fs/tool-fs/`; both must be present with containment enforcement across all five tools for the requirement to be considered landed.

```sh
git grep -n -F "PathScope" "$base" -- packages/fs/tool-fs/
git grep -n -F "basePath" "$base" -- packages/fs/tool-fs/
```
