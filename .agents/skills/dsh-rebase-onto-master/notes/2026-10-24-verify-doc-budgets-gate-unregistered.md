# Leave the word-budget gate unregistered in this repository

- Kind: requirement
- Status: landed
- Identifying paths:
  - scripts/run-gates.ts
  - docs/AGENTS.md
  - .agents/skills/dsh-doc-writing/SKILL.md
- Unique strings or tests:
  - the `doc-budgets` leaf omitted from `docSyncLeafGates`
  - the local exception sentence in `## Wordcount Budgets`

## Intent

`scripts/verify-doc-budgets.ts`, `scripts/doc-budgets.manifest.json`, the `verify-doc-budgets`
package script, and the ceiling rules in root `AGENTS.md` and `docs/AGENTS.md` stay as upstream
ships them. This repository omits the `doc-budgets` leaf from `scripts/run-gates.ts`, so
`pnpm run doc-sync` and `pnpm run test:docs` do not execute the budget check locally and a red
budget never blocks a local change.

`docs/AGENTS.md` and the `dsh-doc-writing` skill state that exception where the ceilings are
described, so the measurement reads as advisory here instead of silently missing. Root `AGENTS.md`
keeps the upstream instruction to raise a ceiling when content genuinely needs the space, and the
`dsh-pr-description` row for raised ceilings stays as upstream ships it; both govern wherever the
`doc-budgets` leaf is part of a gate run, which this repository's local CI is not.

## Already-on-master test

Landed when the leaf is absent from the local gate list while the gate files still exist:

```sh
git grep -n -F -- "'doc-budgets'" HEAD -- scripts/run-gates.ts   # expect no match
git cat-file -e HEAD:scripts/verify-doc-budgets.ts               # expect success
```
