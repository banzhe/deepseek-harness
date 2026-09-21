# Folded Workspace groups badge the folder icon with running and unread-completion state

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
  - `group.running`, `groupRunning`, `folderActivity`
  - `group.completed`, `groupCompletedUnread`, `completedUnread`
  - `badges the closed folder of a folded group whose sessions are executing`
  - `badges the closed folder of a folded group with an unread completion and cedes to running`
  - `reports folded-group activity and clears it while the rows are on screen`
  - `reports the folded group completion reminder and clears it while the rows are on screen`
  - `running: false, completedUnread: false`

## Intent

A folded Workspace group shows no session rows, so the per-row status markers are off screen. The header carries them instead: the closed-folder glyph takes the animated `ongoing` dot while a member Session or a running subagent descendant executes, and the green `done` reminder dot while a member Session finished running without being selected or viewed. Both are derived in `deriveGroups` from the group's visible members and are always false while the group is expanded, where each row owns its own dot. Running takes the badge slot when both apply. The badge is a marker inside the folder span: it takes no focus, and the enclosing row keeps its single toggle action (the `ActiveScheduleIndicator` posture). Accessibility copy goes through `group.running` and `group.completed`.

This note also covers the dependent test fixture: the hover-handoff `workspace()` helper in `rows.client.spec.tsx` builds a `GroupNode` and must set the `running` and `completedUnread` fields this work introduced. The fixture has no independent product behavior.

## Already-on-master test

Run `git grep -n -F -- 'groupRunning' <base> -- packages/client/ui-workspace/src/client/tree.ts`, `git grep -n -F -- 'groupCompletedUnread' <base> -- packages/client/ui-workspace/src/client/tree.ts`, and `git grep -n -F -- 'folderActivity' <base> -- packages/client/ui-workspace/src/client/rows/Rows.module.css`. The work has landed when all three return the symbol, when `locales.ts` carries `group.running` and `group.completed`, and when `GroupNode` declares both `running` and `completedUnread`. Current result: the 0.2.1-rc.3 base has neither badge, so the work is not-landed.
