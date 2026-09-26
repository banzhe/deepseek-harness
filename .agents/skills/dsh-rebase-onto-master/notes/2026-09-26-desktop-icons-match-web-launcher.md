# Desktop icons reuse the Web launcher artwork

- Kind: requirement
- Status: local
- Identifying paths:
  - apps/desktop/resources/icon.png
  - apps/desktop/resources/icon-windows.png
  - apps/desktop/resources/icon-macos.png
  - apps/desktop/resources/tray-windows.ico
  - apps/desktop/scripts/render-app-icons.ts
  - apps/desktop/scripts/render-tray-icon.ts
  - apps/desktop/tests/tray-icon.spec.ts
- Unique strings or tests:
  - `renderApplicationIcons`
  - `ICON_CORNER_FRACTION`
  - `commits the source artwork as the square, opaque image the exports are cut from`
  - `cuts the Windows export to a rounded, transparent tile`
  - `reproduces the committed exports from the committed source`

## Intent

The Desktop application, installer, and uninstaller icons were whale/gradient artwork unrelated to
the Web launcher icons, so one product showed two marks. `resources/icon.png` now holds the same
square artwork the Web application ships, and `pnpm run render:icons` derives every Desktop artifact
from it at the Web corner radius (22% of the edge): full-bleed `icon-windows.png`,
transparent-margin `icon-macos.png`, and the 16–64 px `tray-windows.ico` bitmaps.

The tray no longer enlarges a vector glyph: `render-tray-icon.ts` shrinks to the ICO packer and
parser, and the whale vectors `icon.svg`, `icon-windows.svg`, and `icon-macos.svg` are deleted.
Renderer tests reject a Windows export whose corner arc leaves the Web radius, a macOS export whose
margin is not transparent, and a committed export that the committed source no longer reproduces.

## Already-on-master test

Run `git grep -n -F -- 'render:icons' origin/master -- apps/desktop/package.json`. The work has
landed when that search returns the script, when
`git grep -n -F -- 'renderApplicationIcons' origin/master -- apps/desktop/scripts/render-app-icons.ts`
returns the renderer, and when `git show origin/master:apps/desktop/resources/icon-windows.svg`
fails because the whale vectors are gone.
