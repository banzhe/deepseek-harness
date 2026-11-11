# Shorten the packaged Windows LibreOffice engine path

- Kind: fix
- Status: local
- Identifying paths:
  - apps/desktop-host/src/office-engine.ts (removed upstream)
  - apps/desktop-host/src/office.ts (removed upstream)
  - apps/desktop-host/tests/office-engine.spec.ts (removed upstream)
- Unique strings or tests:
  - windowsOfficeAlias
  - WINDOWS_ENGINE_DIRECTORY_LIMIT
  - libreoffice-cli.mjs
  - publishes a short Windows alias entry for an over-long engine path

## Intent

LibreOffice builds `file:///` resource URLs from the program directory it receives. At the packaged
location `resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai/libreoffice-kit-win32-x64` the
engine directory is 188 characters, so its deepest registry resource exceeds the Windows
260-character limit and conversion fails with `Bootstrapping exception 'stat'ed file did not exist`.

The original fix published a short junction and swapped the resolved module URL through
`registerHooks`, which only reaches code running inside the Electron Host thread. The Office skill
told the model to run the CLI with a standalone `node.exe`, and that child process installs no
module hooks, so it resolved the engine to the over-long physical directory again. Node also
`realpath`s an imported package, so a junction whose target is the long directory collapses back to
the long path even under the hooks.

The fix published `%LOCALAPPDATA%\dsh-libreoffice-kit\node_modules` as a junction to the unpacked
runtime `node_modules` and wrote `libreoffice-cli.mjs` beside it. The entry started the CLI with
`--preserve-symlinks` and `--preserve-symlinks-main`, which is what lets a child process keep the
alias instead of resolving the engine back to its physical directory. Aliases were skipped when the
engine directory already fits, and a location that is itself over the limit failed loud instead of
silently falling back.

## Replay status

Not carried onto this branch. Upstream commit `498d436db5`, which moved Office to the Desktop
profile and removed the Desktop Host engine hooks, retired both carriers this fix sat on: it
deleted `apps/desktop-host/src/office-engine.ts`, `office.ts`, and their specs together with the
module hooks, and
[the v0.2.2-alpha.3 upgrade guide](../../../docs/upgrade-guide/v0.2.2-alpha.3/office-operation-tools/guide.md)
removes the `skill-office` `node`/`cli` keys and the `DSH_BUNDLED_OFFICE_CLI` and
`DSH_BUNDLED_OFFICE_NODE` variables because no component reads them. Office conversion now runs as
Host tools over `packages/document/office-kit`, whose `src/locate.ts` `createEnginePackageResolver`
maps the first `.asar` segment to `.asar.unpacked` and installs nothing else.

The intent therefore has no landing point on this branch. Restart the work only after
`pnpm run package:desktop:win:x64:unsigned` on the current architecture reproduces an over-long
engine path; a port would then belong in the `office-kit` engine resolver rather than in the deleted
Desktop Host module, and must be proven by that packaged build because Node's `realpath` collapse is
what defeated the earlier attempt.

## Already-on-master test

Search for `windowsOfficeAlias` and `WINDOWS_ENGINE_DIRECTORY_LIMIT` in `apps/desktop-host`.
Neither exists on the base, and the module that held them is gone; the check for this requirement is
the packaged Windows build named above, not a source search.
