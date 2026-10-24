# Web and PWA install icons ship the local launcher artwork

- Kind: requirement
- Status: local
- Identifying paths:
  - apps/web/public/icon-192.png
  - apps/web/public/icon-512.png
  - apps/web/public/icon-maskable-512.png
  - apps/web/public/apple-touch-icon.png
  - apps/web/tests/pwa-manifest.e2e.ts
- Unique strings or tests:
  - `ships every declared icon at its declared edge with artwork inside it`
  - `ships an opaque full-bleed maskable icon`
  - `purpose: "maskable"`

## Intent

The installed Web application shows the local launcher artwork instead of the whale vector mark. `icon-192.png` and `icon-512.png` are rounded with a 22% corner radius and carry an alpha channel; `icon-maskable-512.png` and `apple-touch-icon.png` stay full-bleed and opaque, so the platform's own mask does not cut a second shape inside the rounded corners.

The manifest declaration, relative `start_url` and `scope`, `standalone` display mode, `apple-touch-icon` link, and the `.png` entry in the frontend-static MIME table follow the upstream install-icon convention unchanged. `favicon.svg` and `favicon-dark.svg` keep serving the tab's light and dark media queries, and no `.ico` fallback ships.

The whale tile generator (`apps/web/scripts/render-app-icons.ts`) and its `apps/desktop/resources/icon.svg` source stay as upstream ships them, so the committed PNGs no longer match a regeneration of that source. `pwa-manifest.e2e.ts` therefore asserts the shipped bytes — declared edge, non-empty artwork, and an opaque maskable icon — instead of rendering the upstream source and comparing pixels.

## Already-on-master test

Measure the committed PNGs rather than the generator:

```sh
git show <base>:apps/web/public/icon-512.png > /tmp/icon-512.png
```

The work has landed when `icon-512.png` and `icon-192.png` have transparent corners (alpha 0 at 0,0 and at the opposite corner), when `icon-maskable-512.png` and `apple-touch-icon.png` are opaque at those corners, and when `git grep -n -F -- 'renderAppIcons' <base> -- apps/web/tests/pwa-manifest.e2e.ts` returns nothing because that test no longer regenerates the upstream source.
