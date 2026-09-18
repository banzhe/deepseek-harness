# Windows open-in-app launches editors in their own window under a clean environment

- Kind: fix
- Status: local
- Identifying paths:
  - packages/host/open-in-app/src/catalog.ts
  - packages/host/open-in-app/src/resolver.ts
  - packages/host/open-in-app/tests/resolver.spec.ts
- Unique strings or tests:
  - NEW_WINDOW
  - delete inherited.ELECTRON_RUN_AS_NODE
  - opens VS Code folders in their own window, leaving reuse of an already-open folder to the editor
  - drops the inherited Electron Node-mode selector unless the adapter declares it

## Intent

Two Windows defects in the same launch path.

A direct `Code.exe` launch carries no CLI window preference, so the editor's main process targets the last active window and loads the new directory into it, evicting the project that window held. VS Code's Windows locators now pass `NEW_WINDOW` (`--new-window`), which focuses a window already holding the exact directory and opens another only when none does, so the behavior no longer depends on the deployment-invisible `window.openFoldersInNewWindow` setting.

`launchDetachedApp` inherited `ELECTRON_RUN_AS_NODE=1` from the Desktop Host, which runs the shared Web application through the Electron executable. An Electron application started with that selector runs as Node instead of as a GUI: VS Code rejects its own `--new-window` (exit 9) and Cursor resolves the workspace directory as a module path (exit 1). Both exit inside `launchWatchMs`, so `launchResolved` reported `failed` and `POST /open-in-app/open` answered 502. The launcher now removes the selector from the scrubbed base and merges the adapter's explicit `launch.env` afterwards, so an adapter that deliberately needs Node mode — GitHub Desktop's packaged CLI — keeps declaring it and still receives it.

## Already-on-master test

Search the base for both fixes: `git grep -n -F -- 'NEW_WINDOW' <base> -- packages/host/open-in-app/src/catalog.ts` and `git grep -n -F -- 'delete inherited.ELECTRON_RUN_AS_NODE' <base> -- packages/host/open-in-app/src/resolver.ts`. The work has landed when `catalog.ts` exports `NEW_WINDOW` and VS Code's `win32` locators spread it, and when `launchDetachedApp` filters the selector out of `scrubbedParentEnv()` before merging `options.env`.
