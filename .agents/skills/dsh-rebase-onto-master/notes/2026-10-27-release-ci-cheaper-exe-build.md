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

## Intent

Cut the aggregate test and script typechecks that trail every artifact. Every `npm-exe` leg now passes `--build-artifacts` to `scripts/build-npm-exe.ts`, except the linux-x64 leg, which keeps the full `pnpm run build` as the release's one complete check. The archive compression that once accompanied this change is owned by [the Brotli quality note](2026-11-07-brotli-quality-11-release.md).

## Already-on-master test

Search the base for `--build-artifacts` in `.github/workflows/my-dev-electron-release.yml` (upstream `build-exe-for-python-sdk.yml` passes no build-scope flag, so its `pnpm run build` is not this fix).
