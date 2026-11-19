import { chunkCount, chunkRange } from './chunks'
import { uploadError } from './errors'
import { pool, sendPart, stopReason } from './xhr-part'
import type { Transport, TransportFile } from './types'

type HeaderMap = Record<string, string>

export interface ChunkedTransportOptions {
  /** The base URL of the chunk endpoint (see the server contract below). */
  url: string | ((file: TransportFile) => string)
  /** Part size in bytes. Default 5 MiB. */
  chunkSize?: number
  /** Parts of one file sent at the same time. Default 3. */
  parallel?: number
  /** Send a SHA-256 of each part (hex) in the `x-part-sha256` header so the server can verify it. Default `false`. */
  checksum?: 'sha-256' | false
  headers?: HeaderMap | ((file: TransportFile) => HeaderMap | Promise<HeaderMap>)
  withCredentials?: boolean
  /** Milliseconds a single request may take. Default none. */
  timeout?: number
}

/** What the transport keeps between attempts (and may persist): which upload this is and which parts the server has. */
interface State {
  uploadId: string
  chunkSize: number
  done: number[]
}

const hex = (buffer: ArrayBuffer): string => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function sha256(blob: Blob): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
}

const asState = (v: unknown): State | null => {
  const s = v as Partial<State> | null | undefined

  return s !== null && s !== undefined && typeof s.uploadId === 'string' && typeof s.chunkSize === 'number' && Array.isArray(s.done) ? { uploadId: s.uploadId, chunkSize: s.chunkSize, done: s.done.filter((n) => Number.isInteger(n)) } : null
}

/**
 * A generic resumable upload in parts, with a small server contract (`BASE` is `url`):
 *
 * - `POST BASE` with JSON `{ name, size, type, chunkSize, meta }` answers `{ uploadId }` (200 or 201) and may add `chunkSize`
 *   when the server wants a different size.
 * - `GET BASE/:uploadId` answers `{ received: number[] }`, the indexes of the parts it already has (used to resume).
 * - `PUT BASE/:uploadId/parts/:index` with the raw bytes of part `index` (counted from 0) answers 2xx. With `checksum` the
 *   header `x-part-sha256` carries the part's hex SHA-256. Putting a part twice is harmless.
 * - `POST BASE/:uploadId/complete` joins the parts and answers the result (JSON), which becomes `file.result()`. Answer 409 with
 *   a JSON `{ missing: number[] }` when parts are missing and the transport sends them.
 * - `DELETE BASE/:uploadId` throws the upload away (sent when the file is cancelled or removed).
 *
 * The file is sliced with `Blob.slice`, one part at a time per worker; it is never read whole. After every part the state is
 * saved (`saveResumeState`), so a retry, a pause or a page reload (with the state persisted) continues from the parts the server
 * has. The queue's own retry rules apply: 408, 429 and 5xx are retried, other 4xx are not.
 *
 * @example typeof chunkedTransport({ url: '/api/uploads' }).upload // => 'function'
 */
export function chunkedTransport(options: ChunkedTransportOptions): Transport {
  if (typeof options !== 'object' || options === null || options.url === undefined) throw new TypeError('[Pyreon] chunkedTransport: expected { url: "/api/uploads" }.')
  const wanted = options.chunkSize ?? 5 * 1024 * 1024
  const parallel = options.parallel ?? 3

  if (!Number.isInteger(wanted) || wanted < 1) throw new RangeError(`[Pyreon] chunkedTransport: chunkSize must be a whole number of bytes from 1, got ${String(options.chunkSize)}.`)
  if (!Number.isInteger(parallel) || parallel < 1) throw new RangeError(`[Pyreon] chunkedTransport: parallel must be a whole number from 1, got ${String(options.parallel)}.`)

  return {
    async upload(file, ctx) {
      const base = (typeof options.url === 'function' ? options.url(file) : options.url).replace(/\/$/, '')
      const headers = typeof options.headers === 'function' ? await options.headers(file) : (options.headers ?? {})
      const common = { withCredentials: options.withCredentials === true, ...(options.timeout === undefined ? {} : { timeout: options.timeout }), signal: ctx.signal }
      const json = { ...headers, 'content-type': 'application/json' }
      let state = asState(ctx.resumeState)
      const sent = new Map<number, number>()
      const report = (): void => {
        let total = 0

        for (const index of state!.done) total += chunkRange(file.size, state!.chunkSize, index).end - chunkRange(file.size, state!.chunkSize, index).start
        for (const v of sent.values()) total += v
        ctx.onProgress(total)
      }

      try {
        if (state !== null) {
          const known = await sendPart({ url: `${base}/${state.uploadId}`, method: 'GET', headers, ...common }, (s) => (s >= 200 && s < 300) || s === 404 || s === 410)

          if (known.status === 404 || known.status === 410) state = null
          else state.done = [...new Set(((known.body as { received?: number[] } | undefined)?.received ?? []).filter((n) => Number.isInteger(n) && n >= 0))]
        }
        if (state === null) {
          const created = await sendPart({ url: base, method: 'POST', headers: json, body: JSON.stringify({ name: file.name, size: file.size, type: file.type, chunkSize: wanted, meta: file.meta }), ...common })
          const answer = created.body as { uploadId?: unknown; chunkSize?: unknown } | undefined

          if (typeof answer?.uploadId !== 'string') throw uploadError('server', '[Pyreon] chunkedTransport: the server did not answer { uploadId } to the first request.', { retryable: false, body: created.body })
          state = { uploadId: answer.uploadId, chunkSize: typeof answer.chunkSize === 'number' && answer.chunkSize >= 1 ? Math.floor(answer.chunkSize) : wanted, done: [] }
        }
        ctx.saveResumeState({ ...state, done: [...state.done] })
        report()
        const total = chunkCount(file.size, state.chunkSize)
        const todo = Array.from({ length: total }, (_, i) => i).filter((i) => !state!.done.includes(i))

        await pool(todo, parallel, async (index) => {
          const range = chunkRange(file.size, state!.chunkSize, index)
          const part = file.file.slice(range.start, range.end)
          const extra = options.checksum === 'sha-256' ? { 'x-part-sha256': await sha256(part) } : {}

          await sendPart({ url: `${base}/${state!.uploadId}/parts/${index}`, method: 'PUT', headers: { ...headers, ...extra, 'content-type': 'application/octet-stream' }, body: part, size: range.end - range.start, onProgress: (n) => {
            sent.set(index, n)
            report()
          }, ...common })
          sent.delete(index)
          state!.done.push(index)
          ctx.saveResumeState({ ...state!, done: [...state!.done] })
          report()
        })
        const finished = await sendPart({ url: `${base}/${state.uploadId}/complete`, method: 'POST', headers: json, body: JSON.stringify({ parts: total }), ...common })

        return finished.body
      } catch (error) {
        const reason = stopReason(ctx)

        if ((reason === 'cancel' || reason === 'remove') && state !== null) {
          // Best effort: tell the server to forget the upload. It is not awaited and its failure is ignored.
          void fetch(`${base}/${state.uploadId}`, { method: 'DELETE', headers, keepalive: true, signal: AbortSignal.timeout(30_000) }).catch(() => {})
        }
        throw error
      }
    },
  }
}
