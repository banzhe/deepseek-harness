# my_dev release: cheaper single-executable build

- Kind: fix
- Status: local
- Identifying paths:
  - .github/workflows/my-dev-electron-release.yml
  - scripts/build-exe-for-python-sdk.ts
  - scripts/build-exe-for-python-sdk.spec.ts
- Unique strings or tests:
  - `--build-artifacts` in the `npm-exe` build step
  - `matrix.target != 'node24-linux-x64'`
  - `'Zstd'` in the `pkg --sea` invocation
  - `--sea --compress Zstd --targets node24-macos-x64`

## Intent

Cut the two steps that dominate the my_dev release run. Every `npm-exe` leg now passes `--build-artifacts` to `scripts/build-npm-exe.ts` so the aggregate test and script typechecks stop trailing every artifact, except the linux-x64 leg, which keeps the full `pnpm run build` as the release's one complete check. `scripts/build-exe-for-python-sdk.ts` compresses the SEA archive with `Zstd` instead of `Brotli`, which is an order of magnitude faster at a slightly larger archive.

## Already-on-master test

Search the base for `--build-artifacts` in `.github/workflows/my-dev-electron-release.yml` (upstream `build-exe-for-python-sdk.yml` passes no build-scope flag, so its `pnpm run build` is not this fix) and for `'Zstd'` in `scripts/build-exe-for-python-sdk.ts`, whose base value is `'Brotli'`.
