# Monorepo version and lockfile stay in step with the release build

- Kind: fix
- Status: local
- Identifying paths:
  - packages/session/llm-network-stats/package.json
  - pnpm-workspace.yaml
  - pnpm-lock.yaml
  - .agents/skills/dsh-rebase-onto-master/SKILL.md
  - .agents/skills/dsh-rebase-onto-master/references/rebase-notes.md
- Unique strings or tests:
  - `tslib: '2.9.1'`
  - `pnpm exec tsx scripts/release/verify.ts --family dsh --skip-tag-check`

## Intent

Two inputs of the `my_dev release` workflow now agree with what the release build consumes.

`@deepseek-ai/dsh-llm-network-stats` carries the family version `0.2.2-rc.1`, so all 374 `packages/*/*` and `apps/*` members share one version and `DshFamily.verifyVersions` passes for desktop packaging and `scripts/prepare-runtime.ts`. The package exists only on this branch, so a base bump of the root version has to be carried into it by hand.

`pnpm-workspace.yaml` pins `tslib` to `2.9.1` and `pnpm-lock.yaml` records `tslib@2.9.1` with its SHA-512 integrity. The pin also governs the runtime closure of the single-executable build, which `scripts/build-exe-for-python-sdk.ts` deploys with `--config.node-linker=hoisted`: that legacy deploy resolves without the workspace lockfile, so an unpinned transitive dependency can reach a version the lock does not record, and `runtimeNpmArchive` then rejects it as `runtime npm lock: missing SHA-512 integrity`.

The rebase skill states both checks: its post-rebase build section requires `pnpm exec tsx scripts/release/verify.ts --family dsh --skip-tag-check` before any commit, and `references/rebase-notes.md` records the version-sync rule, the lockfile/closure rule, and their failure signatures.

## Already-on-master test

Search the base for the version sync requirement and the pin; `@deepseek-ai/dsh-llm-network-stats` itself is local-only, so its absence already means the work has not landed.

```sh
git grep -n -F -- "tslib: '2.9.1'" <base> -- pnpm-workspace.yaml
git grep -n -F -- 'release/verify.ts --family dsh' <base> -- .agents/skills/dsh-rebase-onto-master
git grep -n -F -- 'dsh-llm-network-stats' <base> -- packages/session
```
