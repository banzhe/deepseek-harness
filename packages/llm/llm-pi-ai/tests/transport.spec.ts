/**
 * The injected transport: a route's request body is compressed as configured,
 * and the same fetch reports how long the body took to leave and how long the
 * response headers took to arrive. An unreported request must keep the exact
 * framing of a byte body, which is what makes the instrumentation opt-in
 * without a second code path on the wire.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { compressingFetch } from '../src/compression.ts'
import type { RequestTransportObservation } from '../src/compression.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(async () => { await closeMockServers() })

/** One JSON request body, as a route's serialized chat payload would arrive. */
function requestBody(text: string): string {
  return JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: text }] })
}

describe('compressingFetch transport', () => {
  it('sends an uncompressed byte body without a reporter', async () => {
    const server = await mockServer([{ body: '{}' }])
    const body = requestBody('hello')

    const response = await compressingFetch(undefined)(`${server.url}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    await response.text()

    expect(server.headers[0]?.['content-length']).toBe(String(Buffer.byteLength(body)))
    expect(server.headers[0]?.['transfer-encoding']).toBeUndefined()
    expect(server.headers[0]?.['content-encoding']).toBeUndefined()
    expect(server.requests[0]).toMatchObject({ model: 'test-model' })
  })

  it('keeps byte-body framing while reporting an uncompressed request', async () => {
    const server = await mockServer([{ body: '{}' }])
    const observations: RequestTransportObservation[] = []
    const body = requestBody('x'.repeat(200_000))

    const response = await compressingFetch(undefined, (observation) => { observations.push(observation) })(
      `${server.url}/chat/completions`,
      { method: 'POST', body },
    )
    await response.text()

    const bytes = Buffer.byteLength(body)
    expect(server.headers[0]?.['content-length']).toBe(String(bytes))
    expect(server.headers[0]?.['transfer-encoding']).toBeUndefined()
    expect(observations).toHaveLength(1)
    const observation = observations[0]
    expect(observation?.requestBytes).toBe(bytes)
    expect(observation?.sentBytes).toBe(bytes)
    expect(observation?.encoding).toBeUndefined()
    expect(observation?.uploadMs).toBeGreaterThanOrEqual(0)
    expect(observation?.responseMs).toBeGreaterThanOrEqual(0)
  })

  it.each(['gzip', 'zstd'] as const)('reports the compressed size of a %s body', async (encoding) => {
    const server = await mockServer([{ body: '{}' }])
    const observations: RequestTransportObservation[] = []
    const body = requestBody('x'.repeat(50_000))

    const response = await compressingFetch(encoding, (observation) => { observations.push(observation) })(
      `${server.url}/chat/completions`,
      { method: 'POST', body },
    )
    await response.text()

    const observation = observations[0]
    expect(server.headers[0]?.['content-encoding']).toBe(encoding)
    expect(server.headers[0]?.['transfer-encoding']).toBeUndefined()
    expect(observation?.encoding).toBe(encoding)
    expect(observation?.requestBytes).toBe(Buffer.byteLength(body))
    expect(observation?.sentBytes).toBeLessThan(Buffer.byteLength(body))
    expect(Number(server.headers[0]?.['content-length'])).toBe(observation?.sentBytes)
    expect(server.requests[0]).toMatchObject({ model: 'test-model' })
  })

  it('leaves a non-string body to its caller', async () => {
    const server = await mockServer([{ body: '{}' }])
    const observations: RequestTransportObservation[] = []

    const response = await compressingFetch('gzip', (observation) => { observations.push(observation) })(
      `${server.url}/chat/completions`,
      { method: 'POST', body: new TextEncoder().encode(requestBody('hello')) },
    )
    await response.text()

    expect(server.headers[0]?.['content-encoding']).toBeUndefined()
    expect(observations).toEqual([])
  })

  it('reports an empty body without streaming it', async () => {
    const server = await mockServer([{ body: '{}' }])
    const observations: RequestTransportObservation[] = []

    const response = await compressingFetch(undefined, (observation) => { observations.push(observation) })(
      `${server.url}/chat/completions`,
      { method: 'POST', body: '' },
    )
    await response.text()

    expect(server.headers[0]?.['content-length']).toBe('0')
    expect(observations).toHaveLength(1)
    expect(observations[0]?.requestBytes).toBe(0)
    expect(observations[0]?.sentBytes).toBe(0)
    expect(observations[0]?.encoding).toBeUndefined()
  })
})
