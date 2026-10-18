# Rebase documents

One Markdown file per rebase, written before the rewrite and committed with it. [dsh-rebase-onto-master](../SKILL.md) produces it. It records only the commits this branch carries beyond the base, and the status of each feature they add, so a checkout on another machine can be brought to the same state after `git pull`.

Commits replay code, tests, and tracked assets. They do not replay the state a branch depends on outside the repository: a tool on `PATH`, an environment variable in a gitignored `.env`, a DSH profile entry, a shortcut, a pinned taskbar item. Git never sees any of it, so nothing warns the next machine that it is stale. These documents are the only record.

## File name

`YYYY-MM-DD-<branch-slug>-onto-<base-version>.md`, dated the day the rebase runs.

## Body

```markdown
# <branch> onto <base-version>

- Base: released `<version>`, the newest `release(dsh):` commit on `origin/master`
- Documented on: <YYYY-MM-DD>, before any rebase
- Rebased on: <YYYY-MM-DD, or "not yet">

## Extra commits and features

Only commits between the fork point and this branch's head. Commits already in the base do not appear.

| Feature | Kind | Status on base | Result |
|---|---|---|---|
| <feature subject> | requirement or fix | landed, not-landed, post-release, or uncertain | replayed, dropped, or skipped |

Identify each feature by its subject and the paths it owns. Commit ids and commit hashes are deliberately absent: a rebase replaces every one of them, and `verify-repository-references` rejects commit hashes in maintained documents.

### <feature subject>

<Intent, in one or two sentences.>

<Behavior a user or a model observes differently, and the paths that carry it.>

<Status: the classification and the evidence used to reach it. For uncertain, state what remains unresolved.>

## Compatibility requirements

Record what another machine must satisfy, never this host's own paths, versions, or local state. Report each row as `compatible`, `actionable`, or `blocked`.

| Item | Required by | Result |
|---|---|---|
| `node` `^22.19 \|\| >=24` | repository engines | compatible |
| `<tool>` | `<script>` | actionable, optional |
| `<NAME>` | `<config>` | actionable |

For every actionable or blocked row, the exact command or edit that resolves it. Name a credential, never its value.

## Steps on another machine

1. `git pull` on the branch.
2. <Install each missing tool.>
3. <Set each environment variable by name.>
4. <Edit the DSH profile or settings.>
5. <Install or refresh the shortcut and any pinned item.>
6. <Run the verification commands.>

## Verification

Exact commands, and the observable result that proves the rebase worked.
```

## Rules

- Document only the extra commits on this branch and their features. Do not summarize the base or commits already landed in it.
- Never write a commit hash.
- Record an `uncertain` feature with its status left open; never drop it from the document.
- Names, never values: record the environment variable and the credential it needs, never the secret.
- Never write this host's private detail: absolute checkout paths, home directory contents, installed tool versions, credential store locations, or whether a shortcut or checkout currently exists.
- Cite paths a reader can open, and commands a reader can run.
- Keep the document tracked. A document on a gitignored path migrates nothing.
- The DSH home, profile, shortcut, and taskbar pin live outside the repository. The document states the steps for them; it never edits another machine's copy.
