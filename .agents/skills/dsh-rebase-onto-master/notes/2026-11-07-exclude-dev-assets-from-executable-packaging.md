# Executable packaging drops development and test payloads

- Kind: requirement
- Status: local
- Identifying paths:
  - scripts/executable-packaging.ts
  - scripts/build-exe-for-python-sdk.ts
  - scripts/build-exe-for-python-sdk-assets.spec.ts
  - scripts/build-exe-for-ssh-helper.ts
- Unique strings or tests:
  - `RUNTIME_DEV_ASSET_IGNORES`
  - `**/node_modules/**/*.{test,spec}.{js,cjs,mjs}`

## Intent

存根：由 commit 推导，未经作者确认。

The single-executable builds stop archiving test suites, fixtures, examples, benchmarks, coverage output, package prose, and development CI, editor, linter, and lock files found under `node_modules`. `scripts/executable-packaging.ts` exports `RUNTIME_DEV_ASSET_IGNORES`; both the Python SDK executable and the SSH helper pass it in the `pkg.ignore` list so the shared patterns have one home.

## Already-on-master test

Search the base for the shared ignore list and the test/fixture pattern.

```sh
git grep -n -F -- 'RUNTIME_DEV_ASSET_IGNORES' <base> -- scripts
git grep -n -F -- 'node_modules/**/*.{test,spec}' <base> -- scripts
```
