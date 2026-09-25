# Shorten the packaged Windows LibreOffice engine path

- Kind: fix
- Status: local
- Identifying paths:
  - apps/desktop-host/src/office-engine.ts
  - apps/desktop-host/src/office.ts
  - apps/desktop-host/tests/office-engine.spec.ts
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
tells the model to run the CLI with a standalone `node.exe`, and that child process installs no
module hooks, so it resolved the engine to the over-long physical directory again. Node also
`realpath`s an imported package, so a junction whose target is the long directory collapses back to
the long path even under the hooks.

The Desktop Host now publishes `%LOCALAPPDATA%\dsh-libreoffice-kit\node_modules` as a junction to
the unpacked runtime `node_modules`, and writes `libreoffice-cli.mjs` beside it. The entry starts the
CLI with `--preserve-symlinks` and `--preserve-symlinks-main`, which is what lets a child process
keep the alias instead of resolving the engine back to its physical directory. Skills receive the
entry, so the model-driven path and the in-process provider reach the same short engine. Aliases are
skipped when the engine directory already fits, and a location that is itself over the limit fails
loud instead of silently falling back.

Verified end to end: `pnpm run package:desktop:win:x64:unsigned` reports
`desktop runtime: DOCX, XLSX, PPTX to PDF and skill CLI discovery passed`, which is the check that
previously failed.

## Already-on-master test

Search for `windowsOfficeAlias` in `apps/desktop-host/src/office-engine.ts`.
