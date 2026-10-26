/**
 * Outgoing request transport for pi-ai routes: the request-body compression a
 * route opts into with `requestCompression`, and the timing and byte counts
 * that fetch observes for the request it puts on the wire.
 *
 * pi-ai exposes no compression option, so the harness compresses the serialized
 * JSON body itself and hands pi-ai an injected `fetch` that writes those bytes.
 * The same fetch is the only place the harness owns the moment the body reaches
 * the HTTP client, which is what separates uploading the conversation from
 * waiting for the model: a streaming body is pulled only as fast as the socket
 * drains, so its last pull is the handover.
 *
 * A protocol that cannot take an injected `fetch` would silently send the body
 * uncompressed, which is why {@link supportsRequestCompression} is also what the
 * route validation refuses against.
 *
 * @module dsh-llm-pi-ai/compression
 */
import { gzip, zstdCompress } from 'node:zlib'
import { promisify } from 'node:util'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'

const gzipAsync = promisify(gzip)
const zstdCompressAsync = promisify(zstdCompress)

/** Encodings a route may select; each is sent as the request's `content-encoding`. */
export const REQUEST_COMPRESSION_ENCODINGS = ['gzip', 'zstd'] as const

/** One selectable `content-encoding` for a compressed request body. */
export type RequestCompressionEncoding = (typeof REQUEST_COMPRESSION_ENCODINGS)[number]

/**
 * Timing and byte counts one injected fetch observed for one request. Every
 * figure belongs to the attempt that actually ran; nothing here is estimated
 * from an earlier request.
 */
export interface RequestTransportObservation {
  /**
   * Milliseconds from dispatch until the HTTP client had taken the complete
   * request body. Connection setup is inside this span, so a cold connection
   * reports it too.
   */
  uploadMs: number
  /** Milliseconds from that handover until the response headers arrived. */
  responseMs: number
  /** Serialized JSON request body size, in bytes. */
  requestBytes: number
  /** Bytes written to the wire: the compressed body when the route compresses. */
  sentBytes: number
  /** The `content-encoding` the body carried; absent for a plain body. */
  encoding?: RequestCompressionEncoding
}

/** One request's transport facts, addressed to the route, model, and Session that issued it. */
export interface RequestTransportFacts extends RequestTransportObservation {
  /** Session that issued the request; absent for a one-shot caller outside any Session. */
  sessionId?: GenerateOptions['sessionId']
  /** Auxiliary call classification; absent for a conversation request. */
  purpose?: GenerateOptions['purpose']
  /** Registered provider route that served the request. */
  provider: string
  /** Provider-owned model id that served the request. */
  model: string
}

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

/** Request-body slice size for an observed upload: small enough to follow socket backpressure. */
const UPLOAD_CHUNK_BYTES = 64 * 1024

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
 * @param bytes - the serialized JSON request body.
 * @returns the compressed bytes, in a Fetch body the call site may pass through.
 */
async function compressRequestBody(
  encoding: RequestCompressionEncoding,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const compressed = encoding === 'gzip' ? await gzipAsync(bytes) : await zstdCompressAsync(bytes)
  // Copied out of the zlib Buffer, whose view is typed over a possibly shared
  // buffer that Fetch's BodyInit excludes — and which may sit in a pooled arena.
  return new Uint8Array(compressed)
}

/**
 * The request body as a stream the HTTP client drains at socket speed.
 *
 * `mark` is called whenever the client has taken everything enqueued so far —
 * at the start of each pull, and once more when the final slice is enqueued, so
 * a client that stops pulling after a known `content-length` still reports its
 * handover. A caller keeps the latest call.
 * @param bytes - the complete body to send.
 * @param mark - handover observer.
 * @returns the streaming body.
 */
function uploadingBody(
  bytes: Uint8Array<ArrayBuffer>,
  mark: () => void,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  let offset = 0
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      mark()
      if (offset >= bytes.byteLength) {
        controller.close()
        return
      }
      const end = Math.min(offset + UPLOAD_CHUNK_BYTES, bytes.byteLength)
      controller.enqueue(bytes.subarray(offset, end))
      offset = end
      if (offset >= bytes.byteLength) mark()
    },
  })
}

/**
 * Wrap `fetch` so one route's JSON request bodies are sent compressed, and so
 * the request's upload and response times are observed.
 *
 * Only a string body is compressed or observed: a streaming or form body cannot
 * be replaced by bytes here, and leaving it alone also leaves the encoding
 * header off, so a request never claims a compression it does not carry.
 * `globalThis.fetch` is read per call, so the harness proxy dispatcher installed
 * on it still applies.
 * @param encoding - the selected `content-encoding`, or undefined for a plain body.
 * @param report - receives one observation per request that reached its response
 *   headers; must not throw, because it runs inside the request it observes.
 * @returns the `fetch` pi-ai sends this route's requests through.
 */
export function compressingFetch(
  encoding: RequestCompressionEncoding | undefined,
  report?: (observation: RequestTransportObservation) => void,
): typeof globalThis.fetch {
  return async (input, init) => {
    if (typeof init?.body !== 'string') return globalThis.fetch(input, init)
    const started = Date.now()
    const raw: Uint8Array<ArrayBuffer> = Buffer.from(init.body, 'utf8')
    const sent = encoding === undefined ? raw : await compressRequestBody(encoding, raw)
    const headers = new Headers(init.headers)
    // The client sized this header for the plain body; the sent bytes decide it.
    headers.delete('content-length')
    if (encoding !== undefined) headers.set('content-encoding', encoding)
    if (report === undefined) {
      return globalThis.fetch(input, { ...init, headers, body: sent })
    }
    // Streaming is what makes the handover observable, and an explicit
    // `content-length` keeps the framing of a byte body: the client then knows
    // the body size instead of falling back to chunked transfer encoding. An
    // empty body has no handover to observe and is sent as bytes.
    const streaming = sent.byteLength > 0
    if (streaming) headers.set('content-length', String(sent.byteLength))
    let handedOverAt = 0
    const observed: RequestInit & { duplex?: 'half' } = {
      ...init,
      headers,
      body: streaming ? uploadingBody(sent, () => { handedOverAt = Date.now() }) : sent,
      ...streaming ? { duplex: 'half' } : {},
    }
    const response = await globalThis.fetch(input, observed)
    const handover = handedOverAt === 0 ? started : handedOverAt
    report({
      uploadMs: Math.max(0, handover - started),
      responseMs: Math.max(0, Date.now() - handover),
      requestBytes: raw.byteLength,
      sentBytes: sent.byteLength,
      ...encoding === undefined ? {} : { encoding },
    })
    return response
  }
}
