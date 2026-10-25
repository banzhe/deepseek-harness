import { describe, expect, it } from 'vitest'
import { assertServiceable, Config, resolveProfiles, type Options } from '../src/config.ts'

/** Validate one hand-declared route, with the caller's fields layered onto it. */
const routeWith = (profile: Record<string, unknown>): (() => unknown) =>
  () => ({ providers: Config({
    providers: {
      'acme-gateway': {
        api: 'openai-completions',
        baseURL: 'https://acme.test',
        models: [{ id: 'm' }],
        ...profile,
      },
    },
  }).providers.get() })

/** Validate that route with the caller's fields on its single model entry. */
const configWith = (model: Record<string, unknown>): (() => unknown) =>
  routeWith({ models: [{ id: 'm', ...model }] })

describe('reasoning schema boundary', () => {
  it('accepts an empty provider section and propagates unexpected catalog failures', () => {
    expect(() => { assertServiceable({}) }).not.toThrow()
    const failure = new TypeError('model metadata lookup failed')
    expect(() => resolveProfiles({ openrouter: { models: [{
      id: '111',
      get name(): string { throw failure },
    }], api: 'openai-completions' } }, 'deferred')).toThrow(failure)
  })

  it('rejects a level pi-ai does not know at the write that produced it', () => {
    expect(configWith({ reasoningEfforts: { ultra: 'x' } })).toThrow(/"off"/)
    expect(configWith({ reasoningEfforts: { high: 42 } })).toThrow()
  })

  it('keeps false distinguishable from an absent declaration', () => {
    type Materialized = { providers: Record<string, { models?: { reasoningEfforts?: unknown }[] }> }
    const withFalse = configWith({ reasoningEfforts: false })() as Materialized
    expect(withFalse.providers['acme-gateway']?.models?.[0]?.reasoningEfforts).toBe(false)
    const absent = configWith({})() as Materialized
    expect(absent.providers['acme-gateway']?.models?.[0]?.reasoningEfforts).toBeUndefined()
  })

  it('rejects a thinking format outside the offered set', () => {
    expect(configWith({ compat: { thinkingFormat: 'quantum' } })).toThrow(/expected/)
  })

  it('accepts Baseten template arguments and completion controls', () => {
    expect(configWith({
      compat: {
        supportsFinishReason: false,
        thinkingFormat: 'baseten',
        chatTemplateArgs: { enable_thinking: { $var: 'thinking.enabled' } },
        supportsThinkingTokenBudget: true,
      },
    })).not.toThrow()
  })
})

describe('modality schema boundary', () => {
  it('rejects a modality pi-ai does not know, at either level', () => {
    expect(configWith({ input: ['audio'] })).toThrow(/expected/)
    expect(routeWith({ defaultInput: ['text', 'audio'] })).toThrow(/expected/)
  })

  it('refuses a route whose models could accept nothing', () => {
    // The pair the settings seam runs: the schema accepts the empty list as
    // well-typed, and the namespace validator is what refuses it. Asserting
    // only the schema would report this route as writable.
    expect(routeWith({ defaultInput: [] })).not.toThrow()
    expect(() => { assertServiceable(routeWith({ defaultInput: [] })() as Options) })
      .toThrow(/defaultInput must name at least one modality/)
  })

  type Materialized = {
    providers: Record<string, { defaultInput?: unknown; models?: { input?: unknown }[] }>
  }

  it('materializes an absent entry list as empty and an absent route list as text', () => {
    // The empty-list inheritance rule exists because of exactly this: an entry
    // that declares nothing reaches resolution as `[]`, not as `undefined`.
    const absent = configWith({})() as Materialized
    expect(absent.providers['acme-gateway']?.models?.[0]?.input).toEqual([])
    expect(absent.providers['acme-gateway']?.defaultInput).toEqual(['text'])
  })
})

describe('request image policy bounds', () => {
  it.each([
    ['requestImagePixelBudget', 0, /requestImagePixelBudget must be a positive safe integer/],
    ['requestImagePixelBudget', Number.MAX_SAFE_INTEGER + 1, /requestImagePixelBudget must be a positive safe integer/],
    ['requestImageMaxBytes', 0, /requestImageMaxBytes must be a positive safe integer/],
    ['requestImageMaxBytes', 1.5, /requestImageMaxBytes must be a positive safe integer/],
  ] as const)('rejects %s=%s at service resolution', (field, value, message) => {
    const programmatic = {
      providers: {
        'acme-gateway': {
          api: 'openai-completions',
          baseURL: 'https://acme.test',
          models: [{ id: 'm' }],
          [field]: value,
        },
      },
    } as Options
    expect(() => {
      assertServiceable(programmatic)
    }).toThrow(message)
  })
})

describe('request compression', () => {
  it('keeps the configured encoding on the resolved profile', () => {
    expect(resolveProfiles({ deepseek: { requestCompression: 'zstd' } }).get('deepseek')?.requestCompression)
      .toBe('zstd')
  })

  it('rejects an encoding outside the offered set at the write that produced it', () => {
    expect(routeWith({ requestCompression: 'br' })).toThrow(/expected/)
  })

  it('rejects an encoding a settings update slipped past the schema', () => {
    const providers = JSON.parse('{"deepseek":{"requestCompression":"br"}}')
    expect(() => resolveProfiles(providers)).toThrow(/requestCompression must be "gzip" or "zstd"/)
  })

  it('refuses a route whose model cannot take the injected fetch', () => {
    expect(() => resolveProfiles({ google: { requestCompression: 'gzip' } }))
      .toThrow(/requestCompression, but model ".*" speaks "google-generative-ai"/)
  })

  it('retains that refusal as a route diagnostic on a stored read', () => {
    const profile = resolveProfiles({ google: { requestCompression: 'gzip' } }, 'deferred').get('google')
    expect(profile?.catalogError).toMatch(/requestCompression/)
    expect(profile?.piProvider).toBeUndefined()
  })

  it('refuses compression over a WebSocket transport that bypasses fetch', () => {
    expect(() => resolveProfiles({ deepseek: { requestCompression: 'gzip', transport: 'websocket' } }))
      .toThrow(/bypasses the fetch/)
  })
})
