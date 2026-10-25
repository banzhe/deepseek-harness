# npm single-executable distribution (`@banzhe/dsh-banzhe`)

- Kind: requirement
- Status: local
- Identifying paths:
  - scripts/build-npm-exe.ts
  - scripts/publish-npm-exe.ts
  - scripts/npm-exe/launcher.js
  - .github/workflows/prepare-my-dev-npm.mjs
  - .github/workflows/my-dev-electron-release.yml
  - scripts/build-exe-for-python-sdk.ts
  - python/sdk-runtime/package.json
- Unique strings or tests:
  - build-npm-exe
  - publish-npm-exe
  - DSHX_BINARY
  - @banzhe/dsh-banzhe

## Intent

Publish the personal `my_dev` build through npm as `@banzhe/dsh-banzhe`: one thin launcher package plus one `os`/`cpu`-selected platform package per target, each carrying the single executable that `scripts/build-exe-for-python-sdk.ts` already produces. The `my_dev` release workflow builds all targets, smokes the packed package on the runner, and publishes platform packages before the launcher at the same version as the GitHub Release tag, so `npm install -g @banzhe/dsh-banzhe` installs and `dsh-banzhe web` runs without a system Node.

Two packaged-`web` defects surfaced while smoking that executable and are fixed in the same change: the runtime dependency closure now carries the `dsh-host-directory-picker` family that the web bundle mounts (peer dependencies are not installed by `pnpm deploy`), and the frontend asset globs match the hoisted `node_modules/**/dsh-web-frontend/dist` layout instead of a top-level path that matched nothing.

## Already-on-master test

Search the base for `.github/workflows/prepare-my-dev-npm.mjs` or `DSHX_BINARY`. Either match means this personal npm distribution has landed.
