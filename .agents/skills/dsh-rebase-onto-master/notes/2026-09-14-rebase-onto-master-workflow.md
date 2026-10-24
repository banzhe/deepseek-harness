# Rebase onto master driven by local requirement notes

- Kind: requirement
- Status: local
- Identifying paths:
  - `.agents/skills/dsh-rebase-onto-master/SKILL.md`
  - `.agents/skills/dsh-rebase-onto-master/notes/README.md`
  - `.agents/skills/dsh-feature-or-fix/SKILL.md`
  - `.agents/skills/dsh-compatibility-check/SKILL.md`
  - `.agents/skills/dsh-non-interactive-git-rebase/SKILL.md`
  - `AGENTS.md`
- Unique strings or tests:
  - `dsh-rebase-onto-master`
  - `dsh-non-interactive-git-rebase`
  - `## Local requirement notes`
  - `Local patches stay replayable`
  - `Rewrite commits (reorder, split, drop, message or author edits)`
  - `release(dsh): <version>`
  - `git rebase --empty=drop --onto "$base" "$fork"`
  - `pnpm run build`
  - `gh pr create --base my_dev`

## Intent

Rebasing this branch onto `master` is a workflow the repository owns, not an ad-hoc rewrite, and it has three parts.

Every local requirement or fix writes one note under this skill in the same change, and the rebase reads those notes to decide whether the chosen base already contains the work. The matching code stays a replayable patch — source and proving tests only, never upstream README, Agent Notes, or pairing files.

The base defaults to the newest released version, which reaches `master` as a commit whose subject is `release(dsh): <version>`; the version in that commit's `package.json` is the version, and tags are local and incomplete. The skill rebases with `--empty=drop --onto "$base" "$fork"`, and a note absent from that base but present on `origin/master` is reported as `post-release` for a retarget decision instead of being replayed. The tip of `master` is the base only when the user asks for it, or names a version.

A rebase replays commits and nothing else, so the skill also captures what no commit can replay: it summarizes the branch, checks this machine against what the branch requires, and carries both into the pull request that delivers the rebase. The pull request body records toolchain and tool requirements, environment variable names, deleted-path references in DSH profiles and root scripts, and per-machine state such as the profile, the shortcut, and the taskbar pin. No file recording the rebase is added to the repository.

Delivery is a pull request into `my_dev` from a `rebase/my-dev-onto-<version>` branch, so `my_dev` is never pushed directly and its divergence from `origin/my_dev` until the merge is a normal intermediate state.

The compatibility findings are local observations, not document content: the pull request body records what another machine must satisfy, never this host's absolute checkout paths, home directory contents, installed tool versions, credential store locations, or whether a shortcut and the plugin checkouts currently exist. Credentials appear by name only.

The replay leaves build outputs untouched, so the skill ends with a local build on this machine: `pnpm install` whenever the replay touched `pnpm-lock.yaml`, a `package.json`, or a workspace manifest, then `pnpm run build` for `lib/` and the runtime bundles. A failing build stops the rebase report and names the failing package and fix.

Three maintenance skills support the workflow and ship with it. `dsh-feature-or-fix` carries the local change procedure, `dsh-compatibility-check` the post-rebase config and plugin check, and `dsh-non-interactive-git-rebase` the scripted history rewrite. Root `AGENTS.md` gains the rule that history rewrites use the non-interactive skill: create a backup branch first and never use `reword` in the todo.

## Already-on-master test

On `origin/master`, search for `dsh-rebase-onto-master`. The work has landed when `.agents/skills/dsh-rebase-onto-master/SKILL.md` exists, tells agents to write notes under `notes/` before rebasing, resolves its default base from the newest `release(dsh):` commit with `--empty=drop --onto "$base" "$fork"`, carries the branch summary and machine-compatibility requirements into a `gh pr create --base my_dev` pull request instead of a tracked document, and ends with a local build running `pnpm install` and `pnpm run build`. On `AGENTS.md`, the same search finds `## Local requirement notes` with `Local patches stay replayable`, and `git cat-file -e <base>:.agents/skills/dsh-non-interactive-git-rebase/SKILL.md` confirms the rewrite skill exists. Current result: the 0.2.1-rc.3 base has neither, so the work is not-landed.
