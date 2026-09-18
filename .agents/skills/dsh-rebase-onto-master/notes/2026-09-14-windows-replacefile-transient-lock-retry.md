# Retry transient Windows ReplaceFileW sharing and lock conflicts

- Kind: fix
- Status: local
- Identifying paths:
  - packages/fs/fs-local/src/win32.ts
  - packages/fs/fs-local/src/fsio.ts
  - packages/fs/fs-local/tests/win32.spec.ts
  - packages/fs/fs-local/tests/fsio.spec.ts
- Unique strings or tests:
  - ERROR_SHARING_VIOLATION
  - ERROR_UNABLE_TO_REMOVE_REPLACED
  - REPLACE_RETRY_DELAYS_MS
  - retries transient sharing, lock, and delete conflicts before replacing
  - maps cancellation during a Windows replacement retry and preserves the old target

## Intent

`dsh-fs-local` retries `ReplaceFileW` only on Win32 errors 32, 33, and 1175 after 25, 50, and 100 ms, maps exhausted conflicts to `EBUSY`, and lets the write abort signal cancel a retry wait before another native publication. Error 1175 (`ERROR_UNABLE_TO_REMOVE_REPLACED`, the replaced file could not be deleted) is the dominant real-world case, because a holder that opened the destination without `FILE_SHARE_DELETE` — an IDE, indexer, or scanner — releases it on its own. Publication stays on `ReplaceFileW`; it does not fall back to rename.

## Already-on-master test

Search `origin/master` for `REPLACE_RETRY_DELAYS_MS` or `ERROR_UNABLE_TO_REMOVE_REPLACED` under `packages/fs/fs-local/src/win32.ts`. The work has landed when `replaceFileWin32` retries those three codes, reports `EBUSY` after exhaustion, and accepts an abort signal.
