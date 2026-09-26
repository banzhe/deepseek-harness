# Windows notification clicks activate and open the clicked Session

- Kind: fix
- Status: local
- Identifying paths:
  - apps/desktop/src/desktop-notifications.ts
  - apps/desktop/src/main.ts
  - apps/desktop/src/preload-app.ts
  - apps/desktop/src/single-instance.ts
  - apps/desktop/tests/desktop-notifications.spec.ts
- Unique strings or tests:
  - DesktopNotificationRouter
  - dsh://open?notification=
  - 'routes a renderer notification show request into the shell toast and rejects invalid payloads'

## Intent

Two Windows gaps broke the app-notification plugin's click-to-session flow. The process never set an AppUserModelID, so Windows silently discarded renderer toasts; and renderer notification clicks never fire from the Windows notification center (electron#29461), so a click on a retained toast did nothing. The shell now sets the AppUserModelID from the packaged manifest's `dshDesktopAppId` (derived from the package name in development), and exposes a `dshDesktop.notifications` preload channel (`show`, `close`, `onActivate`) backed by a main-process toast router whose Windows toastXml `launch` attribute routes `dsh://open?notification=<id>` protocol activations — including second-instance argv handoffs — back to the renderer, which maps the echoed id onto its click target and `openSession`. The consumer plugin (dsh-plugins `app-notification`) prefers this channel and keeps the HTML5 constructor for browsers.

## Already-on-master test

Search the base for `DesktopNotificationRouter` under `apps/desktop/src/` or `dsh://open?notification=` anywhere. The work has landed when `main.ts` calls `app.setAppUserModelId` and the product API exposes `notifications.show`/`onActivate`.
