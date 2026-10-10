# my_dev unsigned Electron release

- Kind: requirement
- Status: local
- Identifying paths:
  - .github/workflows/my-dev-electron-release.yml
  - .github/workflows/prepare-my-dev-windows.mjs
  - apps/desktop/scripts/electron-builder-config.mjs
- Unique strings or tests:
  - my_dev unsigned Electron release
  - myDevWindowsSettings
  - githubReleaseUpdateFeed
  - DSH_DESKTOP_GITHUB_RELEASE_FEED

## Intent

Build an unsigned Windows x64 Electron installer from the personal `my_dev` branch on manual dispatch and on push, publish the installer and nightly feed to a GitHub Release, and make installed builds update from the latest GitHub Release.

## Already-on-master test

Search the base for `.github/workflows/my-dev-electron-release.yml` or `myDevWindowsSettings`. Either match means this personal release workflow has landed.
