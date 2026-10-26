---
description: "Per-request LLM transport figures for clients and maintainers composing or debugging the llmNetworkStats projection unit."
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-network-stats

English | [中文](README.zh.md)

## Summary

This package records what each LLM request cost on the wire — how long its body took to leave, how long the response headers took to arrive, and what request-body compression did to its size — and serves their whole-session figures through the public `llmNetworkStats` value. The figures come from the complete durable log, so paging and compaction do not change them. Use it when a client must show where a request's time went before the model produced anything, or how much a compressed route saved.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin beside the Session store, the projection registry, and an LLM adapter that emits `llm/transport` facts — `@deepseek-ai/dsh-llm-pi-ai` emits them for every route whose wire protocol accepts an injected `fetch`. The unit registers only when the registry is present, and it records nothing while no adapter emits.

### Composition

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-llm-network-stats'
```

### What the figures mean

| Field | Meaning |
|---|---|
| `requests` | Conversation requests that reported transport figures |
| `uploadMs` | Summed time from dispatch until the HTTP client had taken the complete request body, connection setup included |
| `responseMs` | Summed time from that handover until the response headers arrived |
| `requestBytes` / `sentBytes` | Summed body size before compression and bytes written to the wire |
| `compressedRequests` | Counted requests whose body carried a `content-encoding` |
| `last` | The last counted request's own figures, or null before the first |

A client reads one request's figures from `last` and the session's average from the summed field over `requests`. Only conversation requests count: an auxiliary call — compaction, session title — is still recorded, so the figures can be re-derived, but it enters neither the average nor `last`.

### Failures and recovery

The unit is inert without the projection registry: `inject` keeps the fiber pending and nothing registers, so other assemblies lack the `llmNetworkStats` key. Unmounting the plugin removes the key and stops the recording, because both are effects on the mounting fiber. A record that cannot be written — a Session that is not live, a rejected append — is logged and dropped rather than failing the request that produced it. A restored record whose payload a different build wrote is dropped instead of misread.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the fold behind the figures; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

One request's transport facts are a diagnostic about a request that already succeeded, so they travel as an ignorable `plugin:` record rather than as released conversation state: `plugin:llm-network-stats/request` adds no persistence schema root, and a reader that does not recognize it retains and skips it. The unit folds that record type alone, so its figures cannot be confused with model output, and an unknown or malformed payload leaves the fold untouched.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `inject`, unit registration, and the `llm/transport` writer |
| [`src/projection.ts`](src/projection.ts) | The fold: record validation, state shape, wire view |
| [`src/types.ts`](src/types.ts) | One home of the record payload and the `llmNetworkStats` projection-key declaration |

### Data model

The state is exactly the published view — the five sums, the request count, the compressed-request count, and `last` — so one schema validates both the persisted-cache precondition and the wire output boundary. `last` carries the newest counted request's own figures, including its `content-encoding` when it had one.

### Fold rules

- An event that is not this unit's record returns the same state reference; the registry's `Object.is` gate keeps the change feed quiet.
- A record whose payload fails validation is dropped, and a record carrying a `purpose` is recorded but not counted.
- Every counted request adds to all five sums; `compressedRequests` advances only when the body carried an encoding.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the unit's contract is not enough. They move from the registry that drives units to the adapter that reports the facts.

- [Session projection subsystem](../../../docs/subsystems/session-projection.md) — the registry that drives units and serves snapshot and change-feed values.
- [LLM streaming subsystem](../../../docs/subsystems/llm-streaming.md) — the request and stream vocabulary the transport facts belong to.
- [pi-ai adapter package](../../llm/llm-pi-ai/README.md) — the adapter that emits `llm/transport` and owns the injected fetch.

-----

<a id="model-experience"></a>
## Model Experience

None, as the unit folds a plugin record into a client-facing read model and registers nothing model-facing. The record never enters the model-visible surface.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what the figures describe and when the unit is absent. They are current package constraints.

- **Upload time includes connection setup** — the span starts at dispatch, so a cold connection reports DNS, connect, and TLS time as well. Separating them needs a transport-level hook this package does not own.
- **The handover is measured at the HTTP client** — the last body pull is when the client took the final byte, not when the peer acknowledged it; a stalled socket therefore reports the stall.
- **A failed request reports nothing** — facts are reported once the response headers arrive, so an aborted or rejected request has no figures, and it enters neither the average nor `last`.
- **Only routes with an injected `fetch` are measured** — a protocol that refuses one is never instrumented, and a request outside any Session has no log to record into.
- **Averages mix configurations** — a session whose compression setting changed mid-run averages over both, because the figures describe what ran rather than what is configured now.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
