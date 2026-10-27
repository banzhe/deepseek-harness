# This repository does not run the documentation gates

- Kind: requirement
- Status: local
- Identifying paths:
  - AGENTS.md
- Unique strings or tests:
  - `This repository does not run the documentation gates`
  - `(not run in this repository)`

## Intent

States in `AGENTS.md` that `pnpm run test:docs` and `pnpm run doc-sync` are not run in this repository and that a failing documentation gate does not block a local change, so stale generated catalogs (`docs/config-catalog.md`, `packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md`) are left stale instead of regenerated. The command list marks both commands the same way. Pull requests still meet the gates through `check:ci:static`.

## Already-on-master test

Search the named base for the rule:

```sh
git grep -n -F -- 'This repository does not run the documentation gates' <base> -- AGENTS.md
```

Landed when the base carries an equivalent rule; until then the upstream text requires `doc-sync` as evidence for documentation changes, and this file records the deliberate local deviation.
