# Drop the inherited Electron Node-mode selector before launching a desktop application

- Kind: fix
- Status: local
- Identifying paths:
  - packages/host/open-in-app/src/resolver.ts
  - packages/host/open-in-app/tests/resolver.spec.ts
- Unique strings or tests:
  - delete inherited.ELECTRON_RUN_AS_NODE
  - drops the inherited Electron Node-mode selector unless the adapter declares it

## Intent

The Desktop Host runs the shared Web application through the Electron executable
with `ELECTRON_RUN_AS_NODE=1`, and `scrubbedParentEnv()` preserves that name, so
`launchDetachedApp` handed it to every launched application. An Electron
application started with that selector runs as Node instead of as a GUI: VS Code
rejects its own `--new-window` (exit 9) and Cursor resolves the workspace
directory as a module path (exit 1). Both exit nonzero inside the
`launchWatchMs` watch window, `launchResolved` classifies the attempt as
`failed`, and `POST /open-in-app/open` answers 502, so the header button reports
a failed launch for exactly the editor and IDE entries the catalog offers. The
Web profile is unaffected because its Host runs under plain Node.

`launchDetachedApp` now removes `ELECTRON_RUN_AS_NODE` from the scrubbed base
and merges the adapter's explicit `launch.env` afterwards, so an adapter that
deliberately needs Node mode — GitHub Desktop's packaged CLI — keeps declaring
it and still receives it. File-manager entries are unaffected: `shell-open`
launches run through `dsh-native-command`'s run runner rather than
`launchDetachedApp`.

Verified on Windows against the real catalog and the real launcher with
`ELECTRON_RUN_AS_NODE=1` set: `vscode`, `cursor`, `fork`, and `explorer` all
report `launched`, where `vscode` and `cursor` previously exited nonzero inside
the window.

## Already-on-master test

Search for `ELECTRON_RUN_AS_NODE` in `packages/host/open-in-app/src/resolver.ts`
and confirm `launchDetachedApp` filters it out of `scrubbedParentEnv()` before
merging `options.env`.
