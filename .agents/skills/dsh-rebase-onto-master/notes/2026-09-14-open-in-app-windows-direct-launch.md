# Windows open-in-app launches the real executable in a per-project window

- Kind: requirement
- Status: local
- Identifying paths:
  - packages/host/open-in-app/src/catalog.ts
  - packages/host/open-in-app/src/resolver.ts
  - packages/host/open-in-app/tests/resolver.spec.ts
- Unique strings or tests:
  - derefShellShim
  - spawnProgram
  - NEW_WINDOW
  - spawns the executable behind a Windows .cmd shim instead of the shim itself
  - opens VS Code folders in their own window, leaving reuse of an already-open folder to the editor

## Intent

On Windows, open-in-app dereferences `.cmd`/`.bat` shims to the real executable and falls back to the PATH `code` command when registry and known-path locators miss. VS Code's Windows locators pass `--new-window`, not `--reuse-window`: `--reuse-window` sets the editor's `forceReuseWindow` and replaces its last active window, so opening a second workspace evicted the first. The editor's folder-open handling focuses a window already holding the exact directory before it opens another one, so a project's own window is still reused while distinct projects stay open side by side.

## Already-on-master test

Search `origin/master` for `derefShellShim` under `packages/host/open-in-app/`. The work has landed when it exists and VS Code's `win32` locators pass `--new-window` rather than `--reuse-window`.
