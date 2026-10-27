# npm single-executable distribution drops two targets

- Kind: requirement
- Status: local
- Identifying paths:
  - .github/workflows/my-dev-electron-release.yml
  - scripts/build-npm-exe.ts
  - scripts/publish-npm-exe.ts
- Unique strings or tests:
  - `node24-linux-x64,node24-macos-arm64,node24-win-x64`
  - `PLATFORM_SUFFIXES = ['linux-x64', 'darwin-arm64', 'win32-x64']`
  - `只有随包发布的平台可用（Linux x64、macOS arm64、Windows x64）`

## Intent

`@banzhe/dsh-banzhe` publishes only Linux x64, macOS arm64, and Windows x64. The macOS x64 and Linux arm64 legs each cost a runner and produced artifacts this user does not install. The build script's target table also drives the entry package's `optionalDependencies`, so dropping those entries stops an install from resolving platform packages that are never published.

## Already-on-master test

Search the base for `PLATFORM_SUFFIXES` in `scripts/publish-npm-exe.ts`; the file is local-only, so no match means this requirement has not landed.
