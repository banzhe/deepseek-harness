/**
 * Client-namespace projection of the LLM network-stats domain: a pure re-export
 * of the package's types outlet. Client code imports ONLY the client namespace
 * (repo discipline), so the `llmNetworkStats` key stays declared in one place
 * for host and browser consumers alike.
 *
 * @module @deepseek-ai/dsh-experimental-llm-network-stats/client
 */

export type * from './types.ts'
