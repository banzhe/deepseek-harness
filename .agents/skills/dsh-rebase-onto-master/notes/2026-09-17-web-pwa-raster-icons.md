# Web and PWA icons ship as a rounded raster set

- Kind: requirement
- Status: local
- Identifying paths:
  - apps/web/public/manifest.webmanifest
  - apps/web/public/favicon.ico
  - apps/web/public/icon-192.png
  - apps/web/public/icon-512.png
  - apps/web/public/icon-maskable-192.png
  - apps/web/public/icon-maskable-512.png
  - apps/web/public/apple-touch-icon.png
  - apps/web/index.html
  - apps/web/tests/pwa-manifest.e2e.ts
  - packages/host/frontend-static/src/index.ts
- Unique strings or tests:
  - `ships the rounded tab and launcher icons beside the opaque platform-masked set`
  - `purpose: "maskable"`
  - `image/vnd.microsoft.icon`

## Intent

The browser tab and the installed application show one square source artwork instead of the previous `favicon.svg`. The tab and ordinary launcher icons are rounded with a 22% corner radius and carry an alpha channel; the maskable and Apple touch icons stay full-bleed and opaque so the platform's own mask does not cut a second shape inside the rounded corners. The manifest declares real pixel sizes and separates `purpose: "any"` from `purpose: "maskable"`. `favicon.svg` is deleted. The frontend-static MIME table gains `.png` and `.ico`, without which the tab and manifest icons ship as `application/octet-stream`.

This supersedes the earlier `2026-09-16-favicon-brand-blue.md` requirement, which is deleted with this change: it kept a single `#4D6BFE` fill inside `favicon.svg`, and that file no longer ships.

## Already-on-master test

Run `git grep -n -F -- 'favicon.svg' origin/master -- apps/web/index.html apps/web/public/manifest.webmanifest`. The work has landed when that search is empty, when `apps/web/public/icon-512.png` exists on `origin/master`, and when `git grep -n -F -- 'image/vnd.microsoft.icon' origin/master -- packages/host/frontend-static/src/index.ts` returns the MIME entry.
