# Add an unsigned arm64 macOS Desktop package command

- Kind: requirement
- Status: local
- Identifying paths:
  - package.json
  - apps/desktop/package.json
  - apps/desktop/scripts/desktop-release-environment.mjs
  - apps/desktop/scripts/desktop-release-environment.d.mts
  - apps/desktop/scripts/electron-builder-config.mjs
  - apps/desktop/scripts/macos-runtime.ts
  - apps/desktop/scripts/package-target.ts
  - apps/desktop/scripts/prepare-dsh.ts
  - apps/desktop/scripts/smoke-packaged-runtime.ts
  - apps/desktop/scripts/verify-macos-signature.mjs
  - apps/desktop/scripts/verify-macos-signature.d.mts
  - apps/desktop/tests/macos-runtime.spec.ts
  - apps/desktop/tests/macos-signature.spec.ts
  - apps/desktop/tests/package-target.spec.ts
  - apps/desktop/tests/package-target-stages.spec.ts
- Unique strings or tests:
  - package:desktop:mac:arm64:unsigned
  - AD_HOC_SIGNING_IDENTITY
  - unsigned builds require Windows or macOS
  - ad-hoc signs every Mach-O file and verifies nothing for a local unsigned build
  - ad-hoc signs an unsigned macOS build without release credentials and rejects malformed signing modes
  - keeps an unsigned macOS build in the ad-hoc lane without notarization or a release record

## Intent

`--unsigned` also packages macOS arm64 for a personal local build: `pnpm run package:desktop:mac:arm64:unsigned` writes the DMG and ZIP with a `-unsigned` name suffix to `.desktop-build/targets/mac-arm64/unsigned-artifacts/`, omits automatic-update configuration and the release completion record, and needs no Developer ID, p12, keychain, or notarization settings in `.env.macos`. It still requires `DSH_DESKTOP_APP_ID` and the selected mandatory-update origin, which every packaging mode reads.

electron-builder signs the application with codesign's ad-hoc identity `-`, disables the hardened runtime, leaves the DMG unsigned, and skips notarization and the release-identity verification after signing. Apple silicon refuses to execute an unsigned Mach-O, so `prepare:dsh` ad-hoc signs the bundled runtime when `DSH_DESKTOP_UNSIGNED=1`; this change is why `package-target.ts` puts that mode into the environment of every preparation stage, and why `signMacOSRuntime` accepts an absent release identity. An unsigned run signs each file and verifies nothing: with no release identity to check, the exit status of `codesign` is the only evidence kept, and the runtime signature cache is unused.

Only arm64 has an unsigned command. `mac-x64 --unsigned` parses but stops at the packaged-runtime smoke, which accepts unsigned artifacts only for Windows and macOS arm64.

## Already-on-master test

Search for `package:desktop:mac:arm64:unsigned` in `package.json`. The intent is absent from the base while `apps/desktop/scripts/electron-builder-config.mjs` still throws `unsigned builds require Windows` and `apps/desktop/scripts/macos-runtime.ts` has no ad-hoc signing branch.
