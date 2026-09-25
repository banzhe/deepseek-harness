# Shorten the packaged Windows LibreOffice engine path

- Kind: fix
- Status: local
- Identifying paths:
  - apps/desktop-host/src/office-engine.ts
  - apps/desktop-host/tests/office-engine.spec.ts
- Unique strings or tests:
  - shortenWindowsOfficeEngine
  - dsh-libreoffice-kit
  - keeps a short Windows engine path and rejects a junction that cannot be created

## Intent

Packaged Windows LibreOffice conversion fails when the unpacked engine directory is long enough that LibreOffice's `file:///` resource URLs exceed 260 characters. The Desktop Host publishes a short junction for that directory.

## Already-on-master test

Search for `shortenWindowsOfficeEngine` in `apps/desktop-host/src/office-engine.ts`.
