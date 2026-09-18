# Rebase onto master driven by local requirement notes

- Kind: requirement
- Status: local
- Identifying paths:
  - `.agents/skills/dsh-rebase-onto-master/SKILL.md`
  - `.agents/skills/dsh-rebase-onto-master/migrations/README.md`
  - `.agents/skills/dsh-rebase-onto-master/notes/README.md`
  - `AGENTS.md`
- Unique strings or tests:
  - `dsh-rebase-onto-master`
  - `## Local requirement notes`
  - `Local patches stay replayable`
  - `release(dsh): <version>`
  - `## Choose the base`
  - `## Summarize the branch`
  - `## Check machine compatibility`
  - `## Write the migration document`
  - `git rebase --empty=drop --onto "$base" "$fork"`

## Intent

Rebasing this branch onto `master` is a workflow the repository owns, not an ad-hoc rewrite, and it has three parts.

Every local requirement or fix writes one note under this skill in the same change, and the rebase reads those notes to decide whether the chosen base already contains the work. The matching code stays a replayable patch — source and proving tests only, never upstream README, Agent Notes, or pairing files.

The base defaults to the newest released version, which reaches `master` as a commit whose message contains `release(dsh): <version>`; the version in that commit's `package.json` is the version, and tags are local and incomplete. The skill rebases with `--empty=drop --onto "$base" "$fork"`, and a note absent from that base but present on `origin/master` is reported as `post-release` for a retarget decision instead of being replayed. The tip of `master` is the base only when the user asks for it, or names a version.

A rebase replays commits and nothing else, so the skill also captures what no commit can replay: it summarizes the branch, checks this machine against what the branch requires, and writes a tracked migration document under `migrations/` before rewriting history, so another checkout can migrate after `git pull`. The document records toolchain and tool requirements, environment variable names, deleted-path references in DSH profiles and root scripts, and per-machine state such as the profile, the shortcut, and the taskbar pin.

## Already-on-master test

On `origin/master`, search for `dsh-rebase-onto-master`. The work has landed when `.agents/skills/dsh-rebase-onto-master/SKILL.md` exists, tells agents to write notes under `notes/` before rebasing, resolves its default base from the newest `release(dsh): <version>` commit with `--empty=drop --onto "$base" "$fork"`, and writes a tracked `migrations/` document from `## Summarize the branch`, `## Check machine compatibility`, and `## Write the migration document`. On `AGENTS.md`, the same search finds `## Local requirement notes` with `Local patches stay replayable`.
