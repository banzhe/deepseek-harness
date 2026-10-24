# Remove the verify-doc-budgets word-budget gate

- Kind: requirement
- Status: local
- Identifying paths:
  - scripts/verify-doc-budgets.ts
  - scripts/doc-budgets.manifest.json
  - scripts/run-gates.ts
  - package.json
  - docs/AGENTS.md
  - AGENTS.md
  - .agents/skills/dsh-doc/SKILL.md

## Intent

Removes the per-file word-budget gate (`scripts/verify-doc-budgets.ts`, its manifest, the `run-gates` entry, and the `package.json` script) and drops every documentation rule that referred to it, because the budgets measured prose length rather than documentation quality and kept failing on legitimate rewrites.

存根：由 commit 推导，未经作者确认。

## Already-on-master test

Search the named base for the gate and for the rules that reference it:

```sh
git cat-file -e <base>:scripts/verify-doc-budgets.ts
git grep -n -F -- 'doc-budgets' <base> -- scripts/run-gates.ts package.json docs/AGENTS.md
```

Landed when the file is gone and every search returns nothing.
