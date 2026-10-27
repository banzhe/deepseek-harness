# Unsigned desktop packaging runs one runtime smoke

- Kind: fix
- Status: local
- Identifying paths:
  - apps/desktop/scripts/package-target.ts
  - apps/desktop/tests/package-target-stages.spec.ts
  - .github/workflows/my-dev-electron-release.yml
- Unique strings or tests:
  - `invocation.prepareOnly ? [] : ['--defer-runtime-smoke']`
  - `run prepare:dsh --defer-runtime-smoke` asserted for `--unsigned`
  - `ELECTRON_BUILDER_CACHE`

## Intent

`prepare:dsh` deferred its runtime smoke only for signed Windows builds, so unsigned packaging ran the same payload, Host-boot, and Office conversion checks twice: once on the prepared runtime tree and again, through `smoke-packaged-runtime.ts`, on the shipped `app.asar`. The deferral now follows the only early return that skips that packaged smoke, so each packaging run smokes once, after packaging. The my_dev release workflow also caches the directory its Windows packaging step points `ELECTRON_BUILDER_CACHE` at, which removes the repeated NSIS download from each cold runner.

## Already-on-master test

Search the base for `signPrimaryRuntime ? ['--defer-runtime-smoke']` in `apps/desktop/scripts/package-target.ts`; that form means this fix has not landed. `ELECTRON_BUILDER_CACHE` appears only in this personal release workflow.
