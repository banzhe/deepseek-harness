# Migration documents

One Markdown file per rebased branch, written before the rewrite and committed with it. [dsh-rebase-onto-master](../SKILL.md) produces it so a checkout on another machine can be brought to the same state after `git pull`.

Commits replay code, tests, and tracked assets. They do not replay the state a branch depends on outside the repository: a tool on `PATH`, an environment variable in a gitignored `.env`, a DSH profile entry, a Start Menu shortcut, a pinned taskbar item. Git never sees any of it, so nothing warns the next machine that it is stale. These documents are the only record.

## File name

`YYYY-MM-DD-<branch-slug>-onto-<base-version>.md`, dated the day the rebase runs.

## Body

```markdown
# <branch> onto <base-version>

- Base: released `<version>`, the newest `release(dsh):` commit on `origin/master`
- Fork point: the merge-base of this branch and `origin/master` when documented
- Documented on: <YYYY-MM-DD>, before any rebase
- Rebased on: <YYYY-MM-DD, or "not yet">

Commit ids are deliberately absent. A rebase replaces every one of them, and `verify-repository-references` rejects commit hashes in maintained documents in favour of release tags. Identify each change below by its subject and the paths it owns.

## What this branch changes

### <commit subject>

<Intent, in one or two sentences.>

<Behavior a user or a model observes differently, and the paths that carry it.>

<Machine-facing surface: scripts, manifests, lockfile, tsconfig references, assets served at a fixed URL.>

### Verification

<The tests and gates that cover the change, with the command that runs each.>

## Compatibility with this machine

| Item | Required by | This machine | Result |
|---|---|---|---|
| `node` `^22.19 \|\| >=24` | repository engines | `v0.0.0` | compatible |
| `<tool>` | `<script>` | missing | actionable |
| `<NAME>` | `<config>` | absent | actionable |

<For every actionable or blocked row, the exact command or edit that resolves it.>

## Steps on another machine

1. `git pull` on the branch.
2. <Install each missing tool.>
3. <Set each environment variable by name.>
4. <Edit the DSH profile or settings.>
5. <Install or refresh the shortcut and any pinned item.>
6. <Run the verification commands.>

## Verification

<Exact commands, and the observable result that proves the migration worked.>
```

## Rules

- Never write a commit hash. `verify-repository-references` rejects it in maintained files, and a rebase invalidates it anyway; name the version and the commit subject instead.
- Names, never values: record the environment variable and the credential it needs, never the secret.
- Cite paths a reader can open, and commands a reader can run.
- Keep the document tracked. A migration document on a gitignored path migrates nothing.
- The DSH home directory, the profile, the shortcut, and the taskbar pin live outside the repository. A migration document states the steps for them; it never edits another machine's copy.
