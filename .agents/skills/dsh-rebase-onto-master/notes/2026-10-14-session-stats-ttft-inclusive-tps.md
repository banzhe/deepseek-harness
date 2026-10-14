# Session stats: TTFT-inclusive TPS alongside decode TPS

- Kind: requirement
- Status: local
- Identifying paths:
  - packages/session/session-stats/src/projection.ts
  - packages/session/session-stats/src/types.ts
  - packages/client/ui-chat/src/client/chat/StatsPills.tsx
  - packages/client/ui-chat/src/client/chat/stat-dialog.module.css
- Unique strings or tests:
  - `e2eMs`, `e2eTokens`
  - `stats.dialog.speedE2e`, `stats.dialog.speedNote`, `stats.speed.e2e`
  - "Speed incl. TTFT (TPS)"

## Intent

The composer activity pill shows decode TPS (output tokens over time after the first token) followed by a parenthesized TTFT-inclusive TPS (output tokens over the whole step, from request start). The session stats dialog labels both and explains what each measures. The whole-log figures come from the `sessionStats` projection, with the client window fold as fallback.

## Already-on-master test

Search the base for `e2eMs` in `packages/session/session-stats/src/projection.ts` and for `stats.dialog.speedE2e` in `packages/client/ui-chat/src/client/locale.ts`. Absence in the base means not-landed.
