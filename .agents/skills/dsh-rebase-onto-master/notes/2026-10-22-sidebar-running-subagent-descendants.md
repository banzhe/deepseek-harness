# Sidebar activity counts running subagent descendants at any depth

- Kind: fix
- Status: local
- Identifying paths:
  - packages/client/ui-workspace/src/client/tree.ts
  - packages/client/ui-workspace/tests/tree.client.spec.ts
  - packages/client/ui-workspace/tests/workspace-browser.client.spec.tsx
- Unique strings or tests:
  - `runningDescendantCounts`
  - `sessionIsRunning`
  - `counts their running descendants at any depth`
  - `reports a running grandchild through an idle intermediate parent`
  - `counts every running subagent descendant, whether or not its catalog is loaded`
  - `stays finite on self-referencing and cyclic subagent lineage`

## Intent

The Workspace sidebar reported the ongoing loader only one lineage level deep: `runningChildCount` read the parent's loaded `subagentCatalog`, which by definition names direct children only. A grandchild that was running while its own parent was idle therefore left every ancestor above that parent looking idle. The derivation now counts running subagent descendants at any depth in a single post-order pass over the durable `parentId` / `origin` lineage in the list snapshot, matching the Host's own descendant rule (`packages/subagent/subagent/src/archive-admission.ts`): a fork shares `parentId` without the subagent origin and never counts, a cycle is visited once, and an unloaded catalog no longer hides membership.

## Already-on-master test

Search `origin/main` (or the named release commit) for `runningChildCount` in `packages/client/ui-workspace/src/client/tree.ts`. While that helper still reduces over `projectionsBySession[parentId].values.subagentCatalog`, the sidebar counts direct children only and this fix has not landed.
