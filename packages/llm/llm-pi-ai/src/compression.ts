/**
 * Outgoing request-body compression for pi-ai routes that opt in with
 * `requestCompression`. pi-ai exposes no compression option, so the harness
 * compresses the serialized JSON body itself and hands pi-ai an injected
 * `fetch` that puts those bytes on the wire.
 *
 * A protocol that cannot take an injected `fetch` would silently send the body
 * uncompressed, which is why {@link supportsRequestCompression} is also what the
 * route validation refuses against.
 *
 * @module dsh-llm-pi-ai/compression
 */
import { gzip, zstdCompress } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)
const zstdCompressAsync = promisify(zstdCompress)

/** Encodings a route may select; each is sent as the request's `content-encoding`. */
export const REQUEST_COMPRESSION_ENCODINGS = ['gzip', 'zstd'] as const

/** One selectable `content-encoding` for a compressed request body. */
export type RequestCompressionEncoding = (typeof REQUEST_COMPRESSION_ENCODINGS)[number]

/**
 * pi-ai protocols whose implementations forward an injected `fetch` to their
 * HTTP client. The Google adapters refuse one outright and the Bedrock adapter
 * ignores it, so a route naming either must be refused at configuration time
 * rather than sending a plain body that configuration says is compressed.
 */
const COMPRESSING_APIS: readonly string[] = [
  'anthropic-messages',
  'azure-openai-responses',
  'mistral-conversations',
  'openai-codex-responses',
  'openai-completions',
  'openai-responses',
  'pi-messages',
]

/**
 * The wire protocols a route may compress through, for diagnostics.
 * @returns the supported protocol identifiers, in stable order.
 */
export function compressionProtocols(): readonly string[] {
  return COMPRESSING_APIS
}

/**
 * Whether one model's wire protocol honors an injected `fetch`.
 * @param api - the model's `Model.api`.
 * @returns whether a compressed request body reaches the endpoint.
 */
export function supportsRequestCompression(api: string): boolean {
  return COMPRESSING_APIS.includes(api)
}

/**
 * Compress one JSON request body. Asynchronous because a body may carry tens of
 * MiB of base64 image payload, and compressing that synchronously would stall
 * the host event loop for the duration of the request.
 * @param encoding - the selected `content-encoding`.
 * @param body - the serialized JSON request body.
 * @returns the compressed bytes, in a Fetch body the call site may pass through.
 */
async function compressRequestBody(
  encoding: RequestCompressionEncoding,
  body: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = Buffer.from(body, 'utf8')
  const compressed = encoding === 'gzip' ? await gzipAsync(bytes) : await zstdCompressAsync(bytes)
  // Copied out of the zlib Buffer, whose view is typed over a possibly shared
  // buffer that Fetch's BodyInit excludes — and which may sit in a pooled arena.
  return new Uint8Array(compressed)
}

/**
 * Wrap `fetch` so one route's JSON request bodies are sent compressed.
 *
 * Only a string body is compressed: a streaming or form body cannot be replaced
 * by bytes here, and leaving it alone also leaves the encoding header off, so a
 * request never claims a compression it does not carry. `globalThis.fetch` is
 * read per call, so the harness proxy dispatcher installed on it still applies.
 * @param encoding - the selected `content-encoding`.
 * @returns the `fetch` pi-ai sends this route's requests through.
 */
export function compressingFetch(encoding: RequestCompressionEncoding): typeof globalThis.fetch {
  return async (input, init) => {
    if (typeof init?.body !== 'string') return globalThis.fetch(input, init)
    const headers = new Headers(init.headers)
    // The client sized this header for the plain body; Fetch recomputes it for the compressed bytes.
    headers.delete('content-length')
    headers.set('content-encoding', encoding)
    return globalThis.fetch(input, { ...init, headers, body: await compressRequestBody(encoding, init.body) })
  }
}
