# my_dev release: Brotli quality 11 for published executables

- Kind: requirement
- Status: local
- Identifying paths:
  - .github/workflows/my-dev-electron-release.yml
  - .github/workflows/build-exe-for-python-sdk.yml
  - scripts/build-exe-for-python-sdk.ts
  - scripts/build-npm-exe.ts
  - scripts/build-exe-for-python-sdk.spec.ts
  - scripts/build-npm-exe.spec.ts
  - patches/@yao-pkg__pkg@6.21.0.patch
- Unique strings or tests:
  - `DSH_PKG_BROTLI_QUALITY`
  - `--compress-quality=11` in the `npm-exe` build step
  - `--compress-quality applies to --compress=Brotli only`
  - the `npm executable assembler compression flags` suite

## Intent

The release publishes its executable archives at Brotli quality 11. `scripts/build-exe-for-python-sdk.ts` gained `--compress-quality=<0-11>`, which it passes to the pnpm-patched pkg through `DSH_PKG_BROTLI_QUALITY`; the patch keeps quality 6 as its default so a local build stays fast, and rejects a quality that is not 0-11 or a `--compress-quality` without `--compress Brotli`. `scripts/build-npm-exe.ts` forwards `--compress`/`--compress-quality` instead of pinning `Zstd`, and the `npm-exe` step of `.github/workflows/my-dev-electron-release.yml` passes `--compress=Brotli --compress-quality=11`, trading minutes per target for the smallest tarball. The shared Python runtime workflow keeps the fast default; its comment now says so instead of naming a quality the patch never used. Because the patch bytes changed, `pnpm-lock.yaml` records a new `patch_hash` for `@yao-pkg/pkg@6.21.0`.

## Already-on-master test

Search the base for `DSH_PKG_BROTLI_QUALITY` and `--compress-quality`: both are absent from `scripts/build-exe-for-python-sdk.ts`, `scripts/build-npm-exe.ts`, and the `npm-exe` step. The base `patches/@yao-pkg__pkg@6.21.0.patch` calls `zlib.brotliCompressSync` with no options, so it has no quality setting at all.
