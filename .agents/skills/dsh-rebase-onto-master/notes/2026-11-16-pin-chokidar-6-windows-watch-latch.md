# Pin Chokidar 6.0.0 to retire Windows native watch handles

- Kind: fix
- Status: local
- Identifying paths:
  - packages/boot/hmr/package.json
  - packages/boot/hmr/src/watch-config.ts
  - packages/boot/hmr/tests/watch-config.spec.ts
  - packages/boot/plugin-manager/package.json
  - packages/credentials/credentials-local/package.json
  - packages/credentials/credentials-local/src/index.ts
  - packages/credentials/credentials-local/tests/watcher.spec.ts
  - packages/experimental/webworker-runtime/package.json
  - packages/experimental/webworker-runtime/tests/node/chokidar.spec.ts
  - packages/fs/fs-local/package.json
  - packages/skill/skill-filesystem/package.json
  - packages/skill/skill-filesystem/src/index.ts
  - packages/skill/skill-filesystem/tests/skill-filesystem-watcher.spec.ts
  - pnpm-lock.yaml
- Unique strings or tests:
  - `"chokidar": "6.0.0"`
  - `this re-attach is unreachable`
  - `Stands in for Chokidar 5`
  - `as a dependency-fallback`
  - `contains a watcher error emitted after close removed its listeners`
  - `emitEvent('change'`
  - `readyEmitted`

## Intent

Pin `chokidar` to `6.0.0` in the six workspaces that declare it, so a Windows host stops burning 0.9–1.3 cores while a directory that Chokidar 5 watches on its own stays deleted. Only two specs needed adaptation for the 6.0 rewrite; no product code depended on the behavior that changed.

## Why 6.0.0

`skill-filesystem` watches `~/.dsh/skills` at `depth: 1`, so Chokidar opens one native `fs.watch` handle per skill directory. Deleting such a directory as a directory — an empty `rmdir`, or removing `SKILL.md` and the directory a few seconds later — leaves the Chokidar 5.0.0 handle reporting `rename` for the deleted directory itself at 67k–96k raw events/s. Each event re-reads the gone directory; `_handleError` discards the resulting `ENOENT` without emitting and without closing the handle, so the loop repeats at event-loop speed. Measured on the reporting host: 0.92–1.19 cores for 59–75 s without decay, cleared within 15 s once a watched subdirectory exists again.

Chokidar 6.0.0 closes both halves of that path. `handleNativeError` classifies a `ReadDirectoryChangesW` `EPERM` by opening the path: an open failure means the watched directory itself is gone, so it publishes one final `rename`, and either way retires the shared native handle so subscribers reconcile instead of spinning on it. `retireIfSelfRemoved` does the equivalent for Linux inotify. No 5.x release carries either fix. The upgrade gate holds: Electron 44.7.0 embeds Node v24.21.0, above the library's `node >= 22.22`, and this workspace already requires `>= 24.9.0`.

## Regression coverage

No automated test fails on 5.0.0, and none was added. The state that makes the defect observable is Chokidar-internal — `FsWatchInstances` in `backend.js` has no public accessor beyond the `[EV.RAW]` event — so a test can assert only silence over wall-clock time. Every DSH watcher spec mocks `chokidar` at module level, the one real-package spec drives a virtual filesystem, and the remaining observable needs Windows plus a quiet window, which a fixed sleep cannot establish; [dsh-ci-test-reliability](../../dsh-ci-test-reliability/SKILL.md) lists a sleep before an assertion as a defect. The fix rests on the library's contract and on this manual end-to-end verification:

1. On Windows, run a host or harness that watches `~/.dsh/skills` at `depth: 1` with at least one skill directory present.
2. Delete one skill directory as a directory: remove it while empty, or remove `SKILL.md` and then the directory.
3. Sample the process's own CPU for the next 60 s (`[System.Diagnostics.Process]::GetCurrentProcess().TotalProcessorTime` deltas, or the `% Processor Time` performance counter). A latched handle holds 0.9–1.3 cores; a retired one falls to the idle baseline in seconds.
4. Re-create the skill directory and confirm discovery still lists it, which proves the retired handle was re-established rather than dropped.

## Compatibility to verify on the next Chokidar upgrade

- `close()` is final: `add()` after it throws, and `close()` is idempotent. No DSH call site reuses a watcher.
- Constructor option validation throws `TypeError`. `HmrConfig extends ChokidarOptions` spreads deployment values into `watch()`, so an out-of-range `cordis.yml` override now fails at load.
- `usePolling`, `interval`, and `binaryInterval` are deprecated aliases for `backend`, `pollingInterval`, and `pollingBinaryInterval`; `atomic` defaults to `false` under polling.
- `getWatched()` returns a null-prototype object.
- `ignored` no longer applies to directories above the watch root.
- `add()` rejects through the `error` event instead of an unhandled rejection.

## Already-on-master test

Search the base for the pinned version in every manifest that declares `chokidar`, and for the 6.0-only spec members:

```sh
git grep -n -E '"chokidar": "(\^)?6\.0\.0"' "$base" -- 'packages/*/*/package.json'
git grep -n -F "emitEvent('change'" "$base" -- packages/boot/hmr/tests/
git grep -n -F "Chokidar 6 cancels pending writes" "$base" -- packages/
```

The work has landed when all six manifests require `6.0.0` or `^6.0.0`, no `chokidar@5.0.0` importer remains in `pnpm-lock.yaml`, and the source comments name the re-attach as a 5.x fallback.
