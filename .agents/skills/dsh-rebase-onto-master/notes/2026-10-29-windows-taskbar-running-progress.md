# Windows taskbar pulses while a Session is running

- Kind: requirement
- Status: local
- Identifying paths:
  - apps/desktop/src/ipc.ts
  - apps/desktop/src/main.ts
  - apps/desktop/src/preload-app.ts
  - apps/desktop/tests/main-startup.spec.ts
  - apps/desktop/tests/preload-app.spec.ts
- Unique strings or tests:
  - `dsh-desktop:window-progress`
  - `windowProgress`
  - `setProgressBar`
  - `window.setProgressBar`

## Intent

The renderer cannot reach the Windows taskbar. The Desktop application gains `window.setProgressBar(progress)` on the product API, backed by `dsh-desktop:window-progress`. The preload exposes the method; the main process handles it after `assertProductSender`, calling `BrowserWindow.setProgressBar` on Windows only. Progress below `0` clears the indicator; progress above `1` is the native indeterminate pulse. Other platforms resolve without touching the window.

## Already-on-master test

Run `git grep -n -F -- 'dsh-desktop:window-progress' <base> -- apps/desktop/src/ipc.ts` and `git grep -n -F -- 'setProgressBar:' <base> -- apps/desktop/src/preload-app.ts`. The work has landed when the channel exists, the preload exposes `window.setProgressBar`, and the main-process handler calls `setProgressBar` after `assertProductSender` on `win32` only.
