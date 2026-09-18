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
  - `## Build on this machine`
  - `git rebase --empty=drop --onto "$base" "$fork"`
  - `pnpm run build`
  - `Never write this host's private detail`
  - `Record the requirement, not the observation`

## Intent

Rebasing this branch onto `master` is a workflow the repository owns, not an ad-hoc rewrite, and it has three parts.

Every local requirement or fix writes one note under this skill in the same change, and the rebase reads those notes to decide whether the chosen base already contains the work. The matching code stays a replayable patch — source and proving tests only, never upstream README, Agent Notes, or pairing files.

The base defaults to the newest released version, which reaches `master` as a commit whose message contains `release(dsh): <version>`; the version in that commit's `package.json` is the version, and tags are local and incomplete. The skill rebases with `--empty=drop --onto "$base" "$fork"`, and a note absent from that base but present on `origin/master` is reported as `post-release` for a retarget decision instead of being replayed. The tip of `master` is the base only when the user asks for it, or names a version.

A rebase replays commits and nothing else, so the skill also captures what no commit can replay: it summarizes the branch, checks this machine against what the branch requires, and writes a tracked migration document under `migrations/` before rewriting history, so another checkout can migrate after `git pull`. The document records toolchain and tool requirements, environment variable names, deleted-path references in DSH profiles and root scripts, and per-machine state such as the profile, the shortcut, and the taskbar pin.

The compatibility findings are local observations, not document content: the migration document records what another machine must satisfy, never this host's absolute checkout paths, home directory contents, installed tool versions, credential store locations, or whether a shortcut and the plugin checkouts currently exist. The document is committed, so it records the requirement rather than the observation and stays readable outside this machine. Credentials appear by name only.

The replay leaves build outputs untouched, so the skill ends with a local build on this machine: `pnpm install` whenever the replay touched `pnpm-lock.yaml`, a `package.json`, or a workspace manifest, then `pnpm run build` for `lib/` and the runtime bundles. A failing build stops the rebase report and names the failing package and fix.

## Already-on-master test

On `origin/master`, search for `dsh-rebase-onto-master`. The work has landed when `.agents/skills/dsh-rebase-onto-master/SKILL.md` exists, tells agents to write notes under `notes/` before rebasing, resolves its default base from the newest `release(dsh): <version>` commit with `--empty=drop --onto "$base" "$fork"`, writes a tracked `migrations/` document from `## Summarize the branch`, `## Check machine compatibility`, and `## Write the migration document`, and ends with `## Build on this machine` running `pnpm install` and `pnpm run build`. On `AGENTS.md`, the same search finds `## Local requirement notes` with `Local patches stay replayable`.
