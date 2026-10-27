# Session network transport statistics: whole-session totals on the upload, response, and request-body rows

- Kind: requirement
- Status: local
- Identifying paths:
  - packages/client/ui-chat/src/client/chat/StatsPills.tsx
  - packages/client/ui-chat/src/client/locale.ts
  - packages/client/ui-chat/tests/chat-stats.client.spec.tsx
- Unique strings or tests:
  - `stats.network.lastAverage` with a `{total}` placeholder
  - `stats.network.compressionReading` with `{totalBefore}` and `{totalAfter}`
  - `累计 {total}`
  - `Total 7.8 KB→2 KB`
  - `renders the transport rows with the last reading, the session average, and the session total`

## Intent

The composer session-statistics dialog's three transport rows now carry a third segment beside the last reading and the session average: the whole-session total. The upload and response rows append `累计 {total}` — the `llmNetworkStats` projection's already-summed `uploadMs` / `responseMs` — and the request-body row appends `累计 {totalBefore}→{totalAfter}` from the projection's already-summed `requestBytes` / `sentBytes`. The three dictionaries' `stats.dialog.networkNote` gained one sentence naming the trailing total in each language.

Only the client presentation and its copy changed: no projection field, plugin record, session event, or package README moved, because the sums the rows need were already published by `llmNetworkStats`.

## Already-on-master test

Search the named base for the totals in the client copy and the proving test; both must exist for the work to have landed.

```sh
git grep -n -F -- '累计 {total}' <base> -- packages/client/ui-chat
git grep -n -F -- 'the session average, and the session total' <base> -- packages/client/ui-chat
```
