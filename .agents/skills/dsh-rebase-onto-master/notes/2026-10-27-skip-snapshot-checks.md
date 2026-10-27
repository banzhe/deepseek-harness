# This repository does not run snapshot checks

- Kind: requirement
- Status: local
- Identifying paths:
  - AGENTS.md
- Unique strings or tests:
  - `This repository does not run snapshots`
  - `(not run in this repository)`

## Intent

States in `AGENTS.md` that `pnpm run test:snapshot` and `pnpm run test:snapshot:record` are not run in this repository, so a local change needs no recorded-session snapshot, no `snapshots/` fixture, and no SDK expected-output update, and that the snapshot obligations under `Conventions` do not apply here. The command list marks `test:snapshot` the same way, and the commands run only on explicit request.

## Already-on-master test

Search the named base for the rule:

```sh
git grep -n -F -- 'This repository does not run snapshots' <base> -- AGENTS.md
git grep -n -F -- 'not run in this repository' <base> -- AGENTS.md
```

Landed when the base carries an equivalent rule; until then the upstream text still requires a snapshot for every non-trivial model- or product-user-visible change, and this file records the deliberate local deviation.
