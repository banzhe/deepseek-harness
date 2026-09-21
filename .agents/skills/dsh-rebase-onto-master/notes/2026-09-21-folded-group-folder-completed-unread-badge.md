# Folded Workspace groups badge the folder icon with an unread completion

- Kind: requirement
- Status: local
- Identifying paths:
  - packages/client/ui-workspace/src/client/tree.ts
  - packages/client/ui-workspace/src/client/rows/Rows.tsx
  - packages/client/ui-workspace/src/client/rows/Rows.module.css
  - packages/client/ui-workspace/src/client/locales.ts
  - packages/client/ui-workspace/tests/tree.client.spec.ts
  - packages/client/ui-workspace/tests/rows.client.spec.tsx
- Unique strings or tests:
  - `group.completed`
  - `groupCompletedUnread`
  - `completedUnread`
  - `badges the closed folder of a folded group with an unread completion and cedes to running`
  - `reports the folded group completion reminder and clears it while the rows are on screen`

## Intent

The companion of the folded-group running badge (see
2026-09-21-folded-group-folder-running-badge.md): while a Workspace group is
folded, a member Session that finished running while not selected and not yet
viewed — the green `done` reminder dot — is off screen, so the header's
closed-folder glyph carries the reminder instead. `GroupNode.completedUnread`
is derived in `deriveGroups` from the group's visible members'
`completionUnread` status (subagent-origin rows are never visible members) and
is always false while the group is expanded. The renderer seats the `done` dot
in the same folder-badge slot as the running badge; running takes the seat, and
accessibility copy goes through the `group.completed` dictionary entry
(`有会话已完成，未读` / `A session finished and is unread`).

## Already-on-master test

Run `git grep -n -F -- 'groupCompletedUnread' origin/master -- packages/client/ui-workspace/src/client/tree.ts` and `git grep -n -F -- 'group.completed' origin/master -- packages/client/ui-workspace/src/client/locales.ts`. The work has landed when both searches return the symbol, and when `git grep -n -F -- '有会话已完成' origin/master -- packages/client/ui-workspace` returns the dictionary entry.