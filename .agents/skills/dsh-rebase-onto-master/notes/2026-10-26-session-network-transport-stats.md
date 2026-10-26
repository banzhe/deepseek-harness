# Session network transport statistics: upload time, response time, and request-body compression

- Kind: requirement
- Status: local
- Identifying paths:
  - packages/llm/llm-pi-ai/src/compression.ts
  - packages/llm/llm-pi-ai/src/adapter.ts
  - packages/llm/llm-pi-ai/src/index.ts
  - packages/llm/llm-pi-ai/tests/adapter.spec.ts
  - packages/llm/llm-pi-ai/tests/transport.spec.ts
  - packages/experimental/llm-network-stats/package.json
  - packages/experimental/llm-network-stats/tsconfig.json
  - packages/experimental/llm-network-stats/README.md
  - packages/experimental/llm-network-stats/src/index.ts
  - packages/experimental/llm-network-stats/src/projection.ts
  - packages/experimental/llm-network-stats/src/types.ts
  - packages/experimental/llm-network-stats/src/client.ts
  - packages/experimental/llm-network-stats/tests/projection.spec.ts
  - packages/experimental/llm-network-stats/tests/loader-composition.spec.ts
  - packages/session/llm-network-stats/package.json
  - packages/session/llm-network-stats/src/index.ts
  - packages/session/llm-network-stats/src/projection.ts
  - packages/session/llm-network-stats/src/types.ts
  - packages/session/llm-network-stats/src/client.ts
  - packages/session/llm-network-stats/tests/projection.spec.ts
  - packages/session/llm-network-stats/tests/loader-composition.spec.ts
  - packages/session/README.md
  - packages/session/README.zh.md
  - packages/session/README.i18n.yaml
  - packages/bundle/web-app/cordis.patch.yml
  - packages/bundle/web-app/package.json
  - packages/client/ui-chat/src/client/chat/StatsPills.tsx
  - packages/client/ui-chat/src/client/locale.ts
  - packages/client/ui-chat/tests/chat-stats.client.spec.tsx
  - packages/client/ui-chat/package.json
  - packages/client/ui-chat/tsconfig.client.json
  - tsconfig.base.json
  - tsconfig.host.json
  - pnpm-lock.yaml
- Unique strings or tests:
  - `llm/transport`
  - `RequestTransportFacts`
  - `RequestTransportObservation`
  - `plugin:llm-network-stats/request`
  - `llmNetworkStats`
  - `dsh-experimental-llm-network-stats`
  - `dsh-llm-network-stats`
  - `stats.dialog.networkUpload`
  - `stats.network.compressionReading`
  - `compresses the request body as %s when the route asks for it`
  - `records one request and serves it as both the last reading and the average`

## Intent

The composer's session-statistics dialog now reports what each LLM request cost on the wire, separately from TTFT: how long the request body took to leave the client (connection setup included), how long the response headers took to arrive afterwards, and — when the route compresses — the request body's size before and after compression with its ratio. Each figure shows the last request's reading and the whole-session average.

The facts are measured by the fetch the harness already injects for `requestCompression`, which is the only place the harness owns the moment the body reaches the HTTP client. With a reporter attached, `compressingFetch` streams the body in 64 KiB slices and keeps an explicit `content-length`, so the client pulls only as fast as the socket drains and its last pull is the handover; the framing stays that of a byte body. Without a reporter the body is sent as bytes exactly as before, so an assembly that never listens observes no change at all. The adapter injects that fetch for every route whose protocol accepts one (`supportsRequestCompression(model.api)`), not only for compressing routes, and reports each request through the new `llm/transport` event; a listener that throws is logged, never propagated into the request it observes.

Delivery deliberately avoids the released Session format. `StreamChunk` is a declared persistence type, so a `transport` field on its `finish` member would require a `docs/persistence-changes/` acknowledgement with its bilingual pairing sidecar and would regenerate `docs/persistence-schema.json` — the opposite of a replayable local patch. The facts instead travel as `plugin:llm-network-stats/request`, an ignorable record written through `appendPluginRecord` by `@deepseek-ai/dsh-llm-network-stats`, which also owns the `llmNetworkStats` projection unit folding it. Plugin records add no persistence schema root and no known-event-type entry, so `docs/persistence-schema.json`, `packages/core/session/src/known-event-types.ts`, and `docs/persistence-catalog.md` regenerate byte-identical. The client reads the key through `useProjection('llmNetworkStats')`, so an assembly without the plugin renders exactly the rows it did before.

Only conversation requests count. An auxiliary call — compaction, session title — is still recorded so the figures can be re-derived, but it enters neither the average nor the last reading, because one compaction would otherwise dominate the reading the figures exist to show.

Scope is the pi-ai adapter and the `@deepseek-ai/dsh-llm-network-stats` package. `dsh-llm-deepseek` is untouched, no `SessionEventMap` member or released payload changed, `SESSION_FORMAT_VERSION` did not move, and no package README or Agent Note outside the new package was edited.

The figures are a shipped default: the package lives at `packages/session/llm-network-stats` under the product name `@deepseek-ai/dsh-llm-network-stats` — not `packages/experimental/`, because `verify-default-product-isolation` rejects an experimental package in the composed Web profile — and the web-app bundle mounts it beside `session-stats` (`cordis.patch.yml` row `llm-network-stats`, plus the manifest dependency the bare row resolves through). Every profile built on `dsh-base` + `dsh-web-app` therefore records transport facts with no user configuration; an assembly that omits the row still renders the rows it rendered before, because the client reads the key through `useProjection('llmNetworkStats')`.

No file under `docs/**` or `scripts/**` is edited, so the generated catalogs the new package and the new event derive stay at their committed content. Because the package is now a default-mounted product plugin, `docs/config-catalog.md`, `docs/config-catalog.zh.md`, and `packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md` are stale until regenerated. Regenerating them means `pnpm run gen-cordis-catalog`, `pnpm run gen-cordis-api`, `pnpm run gen-config-catalog`, `pnpm run gen-plugin-packages`, `pnpm run gen-module-graph`, and `pnpm run gen-persistence-catalog`; the first two refuse until `RequestTransportFacts` is classified in `TYPE_LINK_EXEMPTIONS` (or `LINK_MAP`) in `scripts/gen-cordis-catalog.ts`, and `verify-package-readme-model-experience` needs a `SENTENCE_MODEL_EXPERIENCE` row for `packages/session/llm-network-stats` unless the README's Model Experience section is written in the long form instead.

## Already-on-master test

Search the named base for the event, the record, the unit, and the shipped mount; all four must exist for the work to have landed.

```sh
git grep -n -F -- "llm/transport" <base> -- packages/llm/llm-pi-ai
git grep -n -F -- 'plugin:llm-network-stats/request' <base>
git grep -n -F -- 'llmNetworkStats' <base>
git grep -n -F -- 'dsh-llm-network-stats' <base> -- packages/bundle
```

Current result: all four are empty on `release(dsh): 0.2.1-rc.2` (the newest release commit, and the only commit with that subject) and on the `origin/master` tip, so the work is not-landed.
