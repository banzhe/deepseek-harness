# Make the DSH upgrade cycle runnable without a human in the loop

- Kind: requirement
- Status: local
- Identifying paths:
  - .agents/skills/dsh-rebase-onto-master/SKILL.md
  - .agents/skills/dsh-compatibility-check/SKILL.md
- Unique strings or tests:
  - `主题行精确等于`
  - `无人值守的冲突闸门`
  - `已知上游既有失败`
  - `合并后校验`

## Intent

Removes the four recurring human-intervention points the 0.2.1-rc.3 upgrade hit, and fixes a baseline-selection defect that would have turned the next unattended rebase into a large false conflict set.

The baseline rule changed because `git log --grep` matches the whole commit message: `^` anchors the start of a line, not the subject. On `origin/master`, `git log -1 --grep='^release(dsh): '` resolves to a merge commit whose body contains a `release(dsh):` line, landing 1411 commits away from the real release and producing conflicts in 8 files. That commit's `package.json` still reports the correct version, so a version assertion cannot detect the mistake; only an exact-subject match count can.

The rest records operational facts this branch's unattended path depends on: missing requirements notes are now backfilled from the commit instead of blocking the replay; conflicts are split into mechanically resolvable and must-stop classes; `verify-doc-graphs` needs `NODE_OPTIONS=--max-old-space-size=8192` because the default heap reports a false failure; `verify-repository-references` fails on every baseline including upstream's tip, so its fingerprint is recorded as pre-existing rather than treated as a regression; both profiles must run `pnpm install` or the declared version and the resolved version silently diverge; and a merged PR is verified against the default branch's actual content, because the rc.3 PR reported MERGED while missing the desktop lockfile fix.

Skill documentation only, no product code.

## Already-on-master test

Search the named base for the exact-subject baseline rule and the unattended sections:

```sh
git grep -n -F -- '主题行精确等于' <base> -- .agents/skills/dsh-rebase-onto-master/SKILL.md
git grep -n -F -- '无人值守的冲突闸门' <base> -- .agents/skills/dsh-rebase-onto-master/SKILL.md
git grep -n -F -- '合并后校验' <base> -- .agents/skills/dsh-compatibility-check/SKILL.md
```

Landed only when all three exist on the base. Current result: both skill files are absent from the `0.2.1-rc.3` base, so the work is not-landed. Upstream's `AGENTS.md` also has no rule admitting these skills, so the same conclusion holds for `origin/master`.
