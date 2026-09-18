# Windows open-in-app opens each VS Code project in its own window

- Kind: fix
- Status: local
- Identifying paths:
  - packages/host/open-in-app/src/catalog.ts
  - packages/host/open-in-app/tests/resolver.spec.ts
- Unique strings or tests:
  - NEW_WINDOW
  - opens VS Code folders in their own window, leaving reuse of an already-open folder to the editor

## Intent

VS Code's Windows locators pass `--new-window`. A direct `Code.exe` launch carries no CLI window preference, so the editor's main process takes the last active window as its target and loads the new directory into it, evicting the project that window held; `--new-window` makes it focus a window already holding the exact directory instead, and open another one only when none does. The behaviour no longer depends on the deployment-invisible `window.openFoldersInNewWindow` setting.

## Already-on-master test

Search `origin/master` for `NEW_WINDOW` under `packages/host/open-in-app/`. The work has landed when `catalog.ts` exports it and VS Code's `win32` locators pass `--new-window`.
