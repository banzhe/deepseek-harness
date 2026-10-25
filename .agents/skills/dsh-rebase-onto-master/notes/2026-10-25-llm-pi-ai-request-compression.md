# Per-route gzip or zstd request-body compression for pi-ai providers

- Kind: requirement
- Status: local
- Identifying paths:
  - packages/llm/llm-pi-ai/src/compression.ts
  - packages/llm/llm-pi-ai/src/config.ts
  - packages/llm/llm-pi-ai/src/catalog.ts
  - packages/llm/llm-pi-ai/src/adapter.ts
  - packages/llm/llm-pi-ai/src/index.ts
  - packages/llm/llm-pi-ai/tests/mock-server.ts
  - packages/llm/llm-pi-ai/tests/adapter.spec.ts
  - packages/llm/llm-pi-ai/tests/config.spec.ts
- Unique strings or tests:
  - `requestCompression`
  - `REQUEST_COMPRESSION_ENCODINGS`
  - `compressingFetch`
  - `supportsRequestCompression`
  - `compresses the request body as %s when the route asks for it`
  - `sends a plain JSON body when the route configures no compression`
  - `compresses an Anthropic Messages route through the same injected fetch`
  - `retains that refusal as a route diagnostic on a stored read`

## Intent

Adds a `requestCompression: 'gzip' | 'zstd'` field to a pi-ai provider profile so that route's outgoing chat request bodies are compressed before they reach pi-ai, which exposes no compression option of its own: the harness compresses the serialized JSON and injects a `fetch` that writes the compressed bytes with the matching `content-encoding`. Omission keeps today's plain JSON body.

Route configuration refuses the setting where it could not take effect — a protocol whose pi-ai implementation cannot accept an injected `fetch` (Google refuses one, Bedrock ignores it) and a WebSocket transport that bypasses `fetch` — so the switch never reports as applied while the body goes out uncompressed. Values are validated both at the schema boundary and in the resolver, because a settings update can reach the resolver without schema validation.

Scope is the pi-ai multi-provider adapter only (`llm-pi-ai`), configured from profile configuration; the native `llm-deepseek` adapter, the Web Models page, package READMEs, Agent Notes, and documentation gates are untouched.

## Already-on-master test

Search the named base for the setting and its transport plumbing:

```sh
git grep -n -F -- 'requestCompression' <base> -- packages/llm/llm-pi-ai
git grep -n -F -- 'compressingFetch' <base> -- packages/llm/llm-pi-ai
```

Landed only when both exist on the base. Current result: `packages/llm/llm-pi-ai/src/compression.ts` is absent on the newest release and on `origin/master` tip, so the work is not-landed.
