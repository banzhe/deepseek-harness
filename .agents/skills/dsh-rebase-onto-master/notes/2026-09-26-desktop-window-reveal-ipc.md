# Desktop renderer can raise its own window

- Kind: requirement
- Status: local
- Identifying paths:
  - apps/desktop/src/ipc.ts
  - apps/desktop/src/main.ts
  - apps/desktop/src/preload-app.ts
  - apps/desktop/tests/main-startup.spec.ts
  - apps/desktop/tests/preload-app.spec.ts
- Unique strings or tests:
  - `dsh-desktop:window-reveal`
  - `windowReveal`
  - `window.reveal()`
  - `reveal`

## Intent

A notification click switches the Session, but the renderer cannot raise its own window: Chromium requires a browser-layer implementation that Electron does not expose, so the switched Session renders behind whichever application is in front. The Desktop application gains the `window.reveal()` product API, backed by the `dsh-desktop:window-reveal` IPC channel. The preload exposes `reveal()` on `window`, and the main process handles it by calling `focusPrimaryWindow` after `assertProductSender` checks the caller's document origin, restoring, showing, and focusing the existing window. No window is created when none is open.

Paths: `apps/desktop/src/ipc.ts`, `src/main.ts`, `src/preload-app.ts`, `tests/main-startup.spec.ts`, `tests/preload-app.spec.ts`. Machine-facing: a new IPC channel name a packaged renderer invokes, and a new member of the preload-exposed product API.

## Already-on-master test

Run `git grep -n -F -- 'dsh-desktop:window-reveal' <base> -- apps/desktop/src/ipc.ts` and `git grep -n -F -- 'reveal: () => ipcRenderer.invoke' <base> -- apps/desktop/src/preload-app.ts`. The work has landed when the channel exists, the preload exposes `reveal()`, and the main-process handler calls `focusPrimaryWindow` after `assertProductSender`.
