import { metadataHeader } from './tus-metadata'
import { uploadError } from './errors'
import { sendPart, stopReason } from './xhr-part'
import type { Transport, TransportFile } from './types'

type HeaderMap = Record<string, string>

export interface TusTransportOptions {
  /** The tus creation endpoint. */
  endpoint: string | ((file: TransportFile) => string)
  /** Bytes per PATCH. Default 5 MiB; `Infinity` sends the whole rest of the file in one PATCH. */
  chunkSize?: number
  /** `Upload-Metadata` entries (values are base64 encoded for you). Default: `filename` and `filetype`. */
  metadata?: (file: TransportFile) => Record<string, string>
  headers?: HeaderMap | ((file: TransportFile) => HeaderMap | Promise<HeaderMap>)
  withCredentials?: boolean
  /** Milliseconds a single request may take. Default none. */
  timeout?: number
}

interface State {
  url: string
}

const TUS = '1.0.0'

const asState = (v: unknown): State | null => {
  const s = v as Partial<State> | null | undefined

  return s !== null && s !== undefined && typeof s.url === 'string' ? { url: s.url } : null
}

const number = (headers: Headers, name: string): number | null => {
  const raw = headers.get(name)
  const n = raw === null ? NaN : Number(raw)

  return Number.isInteger(n) && n >= 0 ? n : null
}

/** What every request of one upload shares. */
interface Wire {
  headers: HeaderMap
  common: { withCredentials: boolean; timeout?: number; signal: AbortSignal }
}

/** Ask the server how far a saved upload got; `null` when it is gone or is not this file. */
async function resumeOffset(url: string, size: number, wire: Wire): Promise<number | null> {
  const head = await sendPart({ url, method: 'HEAD', headers: wire.headers, ...wire.common }, (s) => (s >= 200 && s < 300) || s === 404 || s === 410 || s === 403)

  if (head.status >= 300) return null
  const length = number(head.headers, 'upload-length')

  return length !== null && length !== size ? null : (number(head.headers, 'upload-offset') ?? 0)
}

/** Create an upload (the creation extension) and answer its URL. */
async function create(endpoint: string, file: TransportFile, options: TusTransportOptions, wire: Wire): Promise<string> {
  const meta = (options.metadata ?? ((f: TransportFile) => ({ filename: f.name, filetype: f.type })))(file)
  const metadata = metadataHeader(meta)
  const created = await sendPart({ url: endpoint, method: 'POST', headers: { ...wire.headers, 'upload-length': String(file.size), ...(metadata === '' ? {} : { 'upload-metadata': metadata }) }, ...wire.common }, (s) => s === 201)
  const location = created.headers.get('location')

  if (location === null) throw uploadError('server', '[Pyreon] tusTransport: the server answered 201 without a Location header.', { retryable: false })

  return new URL(location, new URL(endpoint, globalThis.location?.href)).href
}

/** How many offset conflicts (409) in a row `patchAll` re-reads the offset for before it gives up. */
const CONFLICT_REREADS = 3

/**
 * Send the file from `offset` in PATCH requests, each at the offset the server last confirmed. A 409 means the server's offset
 * is not the one sent (another tab or an earlier request that did land moved it): ask it again with HEAD and continue from
 * there, up to `CONFLICT_REREADS` conflicts in a row.
 */
async function patchAll(url: string, file: TransportFile, from: { offset: number; chunk: number }, wire: Wire, onProgress: (loaded: number) => void): Promise<void> {
  const { chunk } = from
  let offset = from.offset
  let conflicts = 0

  while (offset < file.size) {
    const start = offset
    const end = chunk === Infinity ? file.size : Math.min(file.size, start + chunk)
    const response = await sendPart({ url, method: 'PATCH', headers: { ...wire.headers, 'content-type': 'application/offset+octet-stream', 'upload-offset': String(start) }, body: file.file.slice(start, end), size: end - start, onProgress: (n) => onProgress(start + n), ...wire.common }, (s) => s === 204 || s === 409)

    if (response.status === 409) {
      conflicts++
      if (conflicts > CONFLICT_REREADS) throw uploadError('server', `[Pyreon] tusTransport: the server answered 409 (offset conflict) to ${conflicts} PATCH requests in a row, even after asking its offset with HEAD each time. Make sure only one client sends this upload.`, { status: 409, retryable: false })
      const reread = await resumeOffset(url, file.size, wire)

      if (reread === null) throw uploadError('server', '[Pyreon] tusTransport: after an offset conflict (409) the server no longer has this upload; a retry starts a new one.', { status: 409, retryable: true })
      offset = reread
      onProgress(offset)
      continue
    }
    const next = number(response.headers, 'upload-offset')

    if (next === null || next <= start) throw uploadError('server', '[Pyreon] tusTransport: the server did not answer a new Upload-Offset to a PATCH.', { retryable: false })
    conflicts = 0
    offset = next
    onProgress(offset)
  }
}

/**
 * The tus 1.0 resumable upload protocol (https://tus.io/protocols/resumable-upload) with the creation and termination
 * extensions. A new upload `POST`s to the endpoint with `Upload-Length` and `Upload-Metadata` and gets the upload URL in
 * `Location`; data goes in `PATCH` requests with `Upload-Offset`; a resume asks the offset with `HEAD`; cancelling or removing
 * a file sends `DELETE`. The upload URL is saved with `saveResumeState`, so after a failure, a pause or a reload (with the state
 * persisted) the transport asks the server how far it got and continues from there; a 404 or 410 for a saved URL starts over.
 * A PATCH answered 409 (offset conflict) re-reads the offset with HEAD and continues from it, up to three conflicts in a row.
 * Retries are the queue's (`retry`), not the transport's.
 *
 * @example typeof tusTransport({ endpoint: '/files' }).upload // => 'function'
 */
export function tusTransport(options: TusTransportOptions): Transport {
  if (typeof options !== 'object' || options === null || options.endpoint === undefined) throw new TypeError('[Pyreon] tusTransport: expected { endpoint: "/files" }.')
  const chunk = options.chunkSize ?? 5 * 1024 * 1024

  if (chunk !== Infinity && (!Number.isInteger(chunk) || chunk < 1)) throw new RangeError(`[Pyreon] tusTransport: chunkSize must be a whole number of bytes from 1 (or Infinity), got ${String(options.chunkSize)}.`)

  return {
    async upload(file, ctx) {
      const endpoint = typeof options.endpoint === 'function' ? options.endpoint(file) : options.endpoint
      const extra = typeof options.headers === 'function' ? await options.headers(file) : (options.headers ?? {})
      const wire: Wire = { headers: { ...extra, 'tus-resumable': TUS }, common: { withCredentials: options.withCredentials === true, ...(options.timeout === undefined ? {} : { timeout: options.timeout }), signal: ctx.signal } }
      let url = asState(ctx.resumeState)?.url ?? null

      try {
        let offset = url === null ? null : await resumeOffset(url, file.size, wire)

        if (offset === null) {
          url = await create(endpoint, file, options, wire)
          offset = 0
        }
        ctx.saveResumeState({ url })
        ctx.onProgress(offset)
        await patchAll(url!, file, { offset, chunk }, wire, ctx.onProgress)

        return { url, size: file.size }
      } catch (error) {
        const reason = stopReason(ctx)

        if ((reason === 'cancel' || reason === 'remove') && url !== null) void fetch(url, { method: 'DELETE', headers: wire.headers, keepalive: true, signal: AbortSignal.timeout(30_000) }).catch(() => {})
        throw error
      }
    },
  }
}
