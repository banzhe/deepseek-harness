# DSH Web launcher and Start Menu shortcut scripts

- Kind: requirement
- Status: local
- Identifying paths:
  - dsh-web.ps1
  - install-dsh-web-shortcut.ps1
- Unique strings or tests:
  - `pnpm dsh web --no-open`
  - `DSH Web.lnk`
  - `Start the DSH Web UI without opening a browser`
  - `-ForceIcon`

## Intent

`dsh-web.ps1` starts the Web UI from this checkout without opening a browser. It pushes the repository root — its own `$PSScriptRoot` — as the working directory, runs `pnpm dsh web --no-open`, and propagates pnpm's exit code, so the script behaves the same however it is launched. It fails loud when `pnpm` is not on `PATH`, and it proxies pnpm's stderr instead of letting `$ErrorActionPreference = 'Stop'` turn it into a terminating error. Windows does not run a `.ps1` on double-click, so the file is launched through the shortcut or "Run with PowerShell".

`install-dsh-web-shortcut.ps1` creates the `DSH Web` Start Menu shortcut that points at `dsh-web.ps1`, optionally renders a multi-size icon with ImageMagick from the repository favicon, and refreshes the target of an existing taskbar pin. `-ForceIcon` re-renders the icon; a missing ImageMagick warns and leaves the default console icon instead of failing.

Paths: `dsh-web.ps1`, `install-dsh-web-shortcut.ps1`. Machine-facing: both scripts are new, and both live at the repository root. The shortcut and the taskbar pin are per-machine state outside the repository that `git pull` cannot migrate.

## Already-on-master test

Run `git cat-file -e <base>:dsh-web.ps1` and `git grep -n -F -- 'DSH Web.lnk' <base> -- install-dsh-web-shortcut.ps1`. The work has landed when both files exist on the base, when `dsh-web.ps1` runs `pnpm dsh web --no-open`, and when the installer writes the `DSH Web` Start Menu shortcut.
