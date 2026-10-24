# Local requirement and fix notes

Write one Markdown file here for every local requirement or fix in the same change that implements it. [dsh-rebase-onto-master](../SKILL.md) uses these notes to decide whether the chosen base already contains the work.

Keep notes in this skill directory so they do not touch `docs/`, pairing, or documentation gates. Implement the matching code as a replayable patch: owning source and proving tests only; leave upstream README, Agent Notes, and pairing files untouched.

A note is the evidence [dsh-rebase-onto-master](../SKILL.md) classifies against, so it stays in the repository. It is not the record a rebase produces: that record is the pull request body, which the skill drafts in the session and never writes to a tracked file.

## File name

`YYYY-MM-DD-<kebab-topic>.md`, dated the day the work starts. One note per requirement or fix.

## Note body

```markdown
# <short title>

- Kind: requirement | fix
- Status: local | landed
- Identifying paths:
  - <repo-relative path>
- Unique strings or tests:
  - <symbol, test name, or distinctive prose>

## Intent

<What the change does, in one or two sentences.>

## Already-on-master test

<What an agent should search on the base (the newest release commit on `origin/master`, or the version the user named) to decide the work has landed.>
```

Keep `Status: local` while the work exists only on this branch. The rebase skill sets `landed` or deletes the file after it proves the base already contains the intent.
