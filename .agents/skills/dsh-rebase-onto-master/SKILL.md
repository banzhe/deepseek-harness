---
name: dsh-rebase-onto-master
description: Rebase the current branch onto a released version of origin/master by default, using notes under this skill, after summarizing the branch, checking machine compatibility, and writing a tracked migration document under migrations/. Write one note in notes/ for every local requirement or fix in the same change. Use when implementing a requirement or fix, when the user asks to rebase, or when judging whether local work has already landed on the base.
---

# Rebase onto a released version, or master when asked

This skill is for a personal branch. Keep supporting rules as an append-only trailing section in root `AGENTS.md`. Do not edit documentation gates, bilingual pairs, or `.gitignore` to support it.

Write one note under [notes/](notes/README.md) for every local requirement or fix in the same change that implements it. Rebase using those notes, not commit messages alone, to decide whether the base already contains the work. The [history policy](../../../AGENTS.md#conventions) still forbids raw `--force`; stacked PRs stay with [dsh-merging-stacked-prs](../dsh-merging-stacked-prs/SKILL.md).

Default base: the newest release commit on `origin/master`. Rebasing onto the tip of `master` picks up unreleased work and happens only when the user asks for it.

A branch also carries work that no commit can replay: a DSH profile, a Start Menu shortcut, an environment variable, a tool on `PATH`. Before any rewrite, summarize the branch, check that this machine still satisfies it, and record both in a tracked document under [migrations/](migrations/README.md), so the next checkout migrates instead of guessing.

## Author a note

Create `notes/YYYY-MM-DD-<kebab-topic>.md` from [notes/README.md](notes/README.md) before or with the implementation. One note per requirement or fix. Keep `Status: local` while the work exists only on this branch.

Implement the requirement as a small, isolated patch so a later rebase can replay it onto a chosen base. Change only the owning source and the tests that prove the intent. Do not edit upstream README files, Agent Notes, pairing sidecars, documentation gates, or unrelated docs to carry a local requirement.

## Choose the base

Every dsh release reaches `master` as a commit whose message contains the line `release(dsh): <version>`: the subject of the version bump commit and the body of the merge commit that lands it. The newest such commit is the last released version, and it carries that version in its own `package.json`. Release tags named `dsh-v<version>` mark most of those landings, but they are local and incomplete — `origin` carries no tags, and the newest release is untagged — so treat the release message as the authority and a matching tag as the same base.

Resolve a version into a base in this order:

1. The user named a version (`0.1.5-rc.2`, `dsh-v0.1.5-rc.2`) — use that version.
2. The user named `master` or `origin/master` — the base is the tip of `origin/master`; skip the release lookup below.
3. Otherwise — the newest release commit is the base.

```sh
git fetch origin master
base=$(git log origin/master -1 --format='%H' --grep='^release(dsh): ')
```

For a named version, prefer its tag and fall back to the release message:

```sh
version='0.1.5-rc.2'
base=$(git rev-parse --verify --quiet "refs/tags/dsh-v$version")
[ -n "$base" ] || base=$(git log origin/master -1 --format='%H' --grep="^release(dsh): $version")
```

Confirm the base carries the expected version, and report it before rewriting history:

```sh
git show "$base:package.json" | node -p "JSON.parse(require('node:fs').readFileSync(0,'utf8')).version"
git log -1 --format='%h %ci %s' "$base"
```

Stop and ask when either command prints nothing, when the printed version differs from the version the user named, or when `base` is not an ancestor of `origin/master`.

## Preconditions

1. Confirm the checkout. Stop if a merge or rebase is already in progress.

```sh
git status --short --branch
git rev-parse --show-toplevel
```

2. Require a clean worktree except these notes. Stash or commit other changes first.
3. If the branch is in an official GitHub stack, stop and use [dsh-merging-stacked-prs](../dsh-merging-stacked-prs/SKILL.md) instead of rebasing this head alone.
4. Record the current branch, `HEAD`, and the fork point the replay starts from.

```sh
git branch --show-current
git rev-parse HEAD
fork=$(git merge-base HEAD origin/master)
git rev-list --count "$fork..HEAD"
```

Stop when `$fork..HEAD` is empty: there is no local work to replay, so report how far `HEAD` sits behind the base instead of rewriting history.

## Inventory local work

Read every `notes/*.md` file except `README.md`. If a requirement or fix on this branch has no note, write that note before rebasing.

Collect `git log --oneline --reverse "$fork..HEAD"` and the paths each commit touches. Match commits to notes by identifying paths, unique strings, and intent. A commit with no note is uncertain: do not drop it.

## Summarize the branch

Summarize before rewriting anything, because the rebase replaces every commit id and the summary is easier to write while they still line up. Use `"$fork..HEAD"`: `"$base..HEAD"` also names the commits that landed on `master` between the release and the fork, which are not this branch's work.

```sh
git log --oneline --reverse "$fork..HEAD"
git diff --stat "$fork..HEAD"
git diff --shortstat "$fork..HEAD"
git diff --diff-filter=D --name-only "$fork..HEAD"
git diff "$fork..HEAD" -- '*/package.json' pnpm-lock.yaml tsconfig.base.json tsconfig.host.json
```

Cover four things:

1. **Commits** — one line each, with the intent its message states.
2. **Behavior** — what a user or a model observes differently after pulling.
3. **Machine-facing surface** — added, removed, or renamed files that something outside the repository reads: scripts, `package.json` and lockfile entries, `tsconfig` references, and assets served from a fixed URL such as `apps/web/public`.
4. **Verification** — the tests and gates that cover the change.

Cite paths and stay factual. This summary is the body of the migration document; do not write a different account there.

## Check machine compatibility

Compare the branch against this machine in both directions. Report every finding as **compatible**, **actionable** (someone must run a step), or **blocked** (stop and ask).

Does the machine satisfy what the branch now requires?

```sh
node -v
pnpm -v
git --version
node -p "require('./package.json').engines.node"
node -p "require('./package.json').packageManager"
```

Read the tool names out of the branch's own scripts rather than assuming them, then test each one:

```sh
git diff "$fork..HEAD" -- '*.ps1' '*.sh' '*.mjs' | grep -Eoh 'Get-Command [A-Za-z]+|command -v [A-Za-z]+' | sort -u
```

Does machine configuration outside the repository still point at what the branch changed?

```sh
git diff --diff-filter=D --name-only "$fork..HEAD"
grep -rnF 'deepseek-harness' "${DSH_HOME:-$HOME/.dsh}" --include='*.yml' --include='*.yaml' --include='*.json'
```

Set `DSH_HOME` first when the shell does not already export it: the DSH home is not always `$HOME/.dsh`.

Check, at minimum:

- **Toolchain** — `node` and `pnpm` against the declared `engines` and `packageManager`; a lockfile change needs the declared pnpm.
- **External tools** — every binary a new or changed script invokes. Missing and optional = actionable; missing and required = blocked.
- **Environment variables** — names the branch reads, reported as present or absent. Never read, copy, or commit a value; `.env` is gitignored, so a name that lives only there is a per-machine step.
- **Deleted and renamed paths** — search the DSH profile, `settings.yaml`, and root scripts for the removed path. A surviving reference is blocked until its owner fixes it.
- **State outside git** — a shortcut, a pinned taskbar entry, and profile `link:` targets all survive a pull and keep pointing at the old target.
- **Absolute paths** — a profile linking `D:/personal/...` is per-machine and cannot migrate by pulling.

Report the findings before rewriting history. Never edit another machine's DSH home; write the step into the migration document instead.

## Write the migration document

Create `migrations/YYYY-MM-DD-<branch-slug>-onto-<base-version>.md` from [migrations/README.md](migrations/README.md) before the rebase, so the pre-rebase state is recorded while it exists. Fill it from the two sections above: the branch summary, the compatibility findings each with the command or edit that resolves it, and the ordered steps another machine runs after `git pull` — tool installs, environment variables, profile edits, shortcut installation, and the commands that verify the result.

The document is version-controlled, so keep it tracked and commit it with the branch; never write it to a gitignored path. Identify each change by its commit subject and paths, never by a commit hash: `verify-repository-references` rejects hashes in maintained files, and the rebase invalidates them. Run `git commit` only when the user asks for a commit; otherwise leave the document written and staged for the next commit. Record environment facts as a reader needs them, and only the names of credentials.

## Decide what the base already contains

For each note with `Status: local`, search the chosen base — not `origin/master` — using the note's **Already-on-master test**, identifying paths, and unique strings:

```sh
git grep -n -F -- <unique-string> "$base" -- <path>
git log "$base" -- <path>
```

Classify the note:

- **landed** — the base already implements the stated intent, even if the local patch differs.
- **not-landed** — the intent is absent from the base.
- **post-release** — the intent is absent from the base but present on `origin/master`, so a later release already carries it. Report it and ask whether to retarget `origin/master`; rebasing onto the version replays work upstream already accepted.
- **uncertain** — the search is inconclusive. Stop and ask; do not drop the work.

Report the classification before rewriting history. Do not rebase until landed versus not-landed is explicit for every matched note.

## Replay onto the base

Rebase onto the chosen base from the recorded fork point, with empty commits dropped:

```sh
git rebase --empty=drop --onto "$base" "$fork"
```

During a conflict, identify the commit and its note:

- **landed** — take the base side (`ours` during a rebase) for the note's paths. If the commit then has no remaining diff, `git rebase --skip`; otherwise stage the base versions and `git rebase --continue`.
- **not-landed** — keep the local intent and resolve the conflict. Do not take the base blindly.
- **uncertain** or **no note** — stop. Leave the rebase in progress and ask.

Rebasing onto a version leaves the branch without the commits in `"$base..origin/master"`; they return at the next rebase onto `master` or a newer release. Say so in the report.

Do not use raw `--force`. Abort with `git rebase --abort` rather than leaving a mixed tree if the user cancels.

## After the rebase

1. Delete or set `Status: landed` on every note classified landed.
2. Keep `Status: local` notes that still describe commits in `"$base..HEAD"`.
3. Set `Rebased on:` in the migration document and drop the steps for work classified landed; the document names changes by subject and path, so the rewrite leaves it readable.
4. If the branch has an upstream, publish only when the user asks, and only with an exact lease:

```sh
git fetch origin <branch>
git push --force-with-lease=<branch>:<observed-oid> origin <branch>
```

5. Select post-rewrite checks with [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md) when the user asked to push or to claim the branch is ready.

Report the version and base used, the new `HEAD`, which notes landed, which commits were skipped or dropped, the migration document path, and any remaining local notes.
