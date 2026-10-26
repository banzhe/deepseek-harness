# Harness session attribution headers for pi-ai providers

- Kind: requirement
- Status: local
- Identifying paths:
  - packages/llm/llm-pi-ai/src/adapter.ts
  - packages/llm/llm-pi-ai/tests/adapter.spec.ts
- Unique strings or tests:
  - `x-deepseek-harness-session-id`
  - `x-deepseek-harness-compact`
  - `sends Harness session attribution on a route without provider affinity support`

## Intent

The pi-ai multi-provider adapter now stamps `x-deepseek-harness-session-id` on every request that carries `GenerateOptions.sessionId`, and `x-deepseek-harness-compact: 1` on `purpose: 'compaction'` requests, matching what `dsh-llm-deepseek` already sends. The agent loop always supplies the session id, so before this change no pi-ai route sent either header, and a gateway could not attribute requests to a session.

The headers travel in the `headers` object handed to `models.streamSimple` rather than through pi-ai's own session-affinity support. pi-ai emits its affinity headers only when the route's resolved compat enables `sendSessionAffinityHeaders`, which its detection sets for OpenRouter alone, and this package's compat gate withholds that field from configuration, so no profile could enable it. pi-ai merges the adapter's options headers last (`Object.assign(headers, optionsHeaders)` in `dist/api/openai-completions.js`), so injecting them there wins collisions with deployment headers and reaches the wire without changing the gate.

Scope is the pi-ai adapter only: no new config field, no change to the compat gate, and no change to the affinity headers pi-ai sends on routes that already enable them. `dsh-llm-deepseek`, package READMEs, Agent Notes, and documentation gates are untouched.

## Already-on-master test

Restrict the search to `packages/llm/llm-pi-ai`: both header names already exist repo-wide in `packages/llm/llm-deepseek` and in `docs/deepseek-llm-api-wire-extensions.md`, so an unscoped search always matches and proves nothing.

```sh
git grep -n -F -- 'x-deepseek-harness-session-id' <base> -- packages/llm/llm-pi-ai
git grep -n -F -- 'x-deepseek-harness-compact' <base> -- packages/llm/llm-pi-ai
git grep -n -F -- 'headers: requestHeaders(profile.headers)' <base> -- packages/llm/llm-pi-ai
```

Landed when this path carries both header names and the adapter no longer builds its `streamSimple` headers from `requestHeaders(profile.headers)` alone. Current result: the first two greps are empty and the third still matches `packages/llm/llm-pi-ai/src/adapter.ts:424` on `release(dsh): 0.2.1-rc.2` (the newest release commit, and the only commit with that subject) and on the `origin/master` tip, so the work is not-landed.
