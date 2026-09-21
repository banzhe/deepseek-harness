# Folded Workspace groups badge the folder icon while a session executes

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
  - `group.running`
  - `groupRunning`
  - `folderActivity`
  - `badges the closed folder of a folded group whose sessions are executing`
  - `reports folded-group activity and clears it while the rows are on screen`

## Intent

The sidebar session tree's Workspace (folder) header reports executing work while the group is folded. A folded group shows no session rows, so their status dots are off screen; the header's closed-folder glyph carries the same animated `ongoing` state dot as a badge on its bottom-right corner, labelled `group.running` (`有会话正在运行` / `A session is running`). `GroupNode.running` is derived in `deriveGroups` from the group's visible members — a running Session or a running subagent descendant — and is always false while the group is expanded, where each row already owns its status dot. The badge is a marker inside the folder span: it takes no focus, and the enclosing row keeps its single toggle action (the `ActiveScheduleIndicator` posture).

## Already-on-master test

Run `git grep -n -F -- 'groupRunning' origin/master -- packages/client/ui-workspace/src/client/tree.ts` and `git grep -n -F -- 'group.running' origin/master -- packages/client/ui-workspace/src/client/locales.ts`. The work has landed when both searches return the symbol, and when `git grep -n -F -- 'folderActivity' origin/master -- packages/client/ui-workspace/src/client/rows/Rows.module.css` returns the badge rule.
