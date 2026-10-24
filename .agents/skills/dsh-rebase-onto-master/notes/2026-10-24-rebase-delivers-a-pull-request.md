# Deliver a rebase as a pull request instead of a tracked document

- Kind: requirement
- Status: local
- Identifying paths:
  - `.agents/skills/dsh-rebase-onto-master/SKILL.md`
  - `.agents/skills/dsh-rebase-onto-master/notes/README.md`
  - `AGENTS.md`
- Unique strings or tests:
  - `## 5. 整理 PR 描述草稿`
  - `gh pr create --base my_dev`
  - `不直接推送 `my_dev``
  - `rebase/my-dev-onto-<base-version>`

## Intent

A rebase no longer writes its record into the repository and no longer pushes `my_dev`. It drafts the branch summary, the per-note classification, the compatibility requirements, and the verification results into a pull request body, then delivers the rebase from a `rebase/my-dev-onto-<version>` branch as a pull request whose base is `my_dev`.

The `rebase/` directory and its nine historical migration documents are deleted, along with the README that specified their format. The per-requirement notes under `notes/` stay: they are the evidence a rebase classifies against, which is a different concern from the record a rebase produces.

`my_dev` is never pushed directly, so it diverges from `origin/my_dev` from the rewrite until the pull request merges; the skill resets it to `origin/my_dev` after the merge rather than pushing the rewrite.

## Already-on-master test

Search the named base for the delivery rule and for the removed document tree:

```sh
git grep -n -F -- 'gh pr create --base my_dev' <base> -- .agents/skills/dsh-rebase-onto-master/SKILL.md
git ls-tree -r --name-only <base> -- .agents/skills/dsh-rebase-onto-master/rebase/
```

Landed when the first command matches and the second prints nothing. Current result: the `0.2.1-rc.3` base has no `dsh-rebase-onto-master` skill at all, so the work is not-landed.
