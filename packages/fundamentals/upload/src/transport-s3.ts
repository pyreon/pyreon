import { chunkCount, chunkRange, suggestChunkSize } from './chunks'
import { uploadError } from './errors'
import { pool, sendPart, stopReason } from './xhr-part'
import type { Transport, TransportFile } from './types'

type HeaderMap = Record<string, string>

/** A URL to send to, with the headers that were signed into it. */
export interface Presigned {
  url: string
  method?: 'PUT' | 'POST'
  headers?: HeaderMap
}

export interface S3MultipartOptions {
  /** Start a multipart upload: your server calls `CreateMultipartUpload` and answers its upload id. */
  create(file: TransportFile): Promise<{ uploadId: string }>
  /** A presigned URL for one part (`partNumber` counts from 1): your server signs `UploadPart`. */
  signPart(file: TransportFile, part: { uploadId: string; partNumber: number }): Promise<Presigned>
  /** Join the parts: your server calls `CompleteMultipartUpload` with the part numbers and ETags. Its answer becomes `file.result()`. */
  complete(file: TransportFile, parts: { uploadId: string; parts: { partNumber: number; etag: string }[] }): Promise<unknown>
  /** Throw the upload away: your server calls `AbortMultipartUpload`. Sent when the file is cancelled or removed. */
  abort?(file: TransportFile, upload: { uploadId: string }): Promise<void>
  /**
   * Parts the server already has, for resuming: your server calls `ListParts`. Without it, a resumed upload trusts the part list saved
   * in the resume state.
   */
  list?(file: TransportFile, upload: { uploadId: string }): Promise<{ partNumber: number; etag: string }[]>
}

export interface S3TransportOptions {
  /** A presigned URL for a single-request upload of the whole file (`PutObject`). */
  presign(file: TransportFile): Promise<Presigned>
  /** Multipart upload for big files. Used when the file is larger than `partSize`; smaller files use `presign`. */
  multipart?: S3MultipartOptions
  /** Part size in bytes. Default 8 MiB, raised so that a file never needs more than 10,000 parts (S3's limit); never below 5 MiB (S3's minimum). */
  partSize?: number
  /** Parts of one file sent at the same time. Default 3. */
  parallel?: number
  withCredentials?: boolean
}

interface State {
  uploadId: string
  partSize: number
  parts: { partNumber: number; etag: string }[]
}

const asState = (v: unknown): State | null => {
  const s = v as Partial<State> | null | undefined

  return s !== null && s !== undefined && typeof s.uploadId === 'string' && typeof s.partSize === 'number' && Array.isArray(s.parts) ? { uploadId: s.uploadId, partSize: s.partSize, parts: s.parts } : null
}

/** The ETag of a part response; S3 sends it as a header the bucket's CORS rule must expose. */
function etagOf(headers: Headers): string {
  const etag = headers.get('etag')

  if (etag === null) throw uploadError('server', '[Pyreon] s3Transport: the part response has no ETag header. Add "ETag" to ExposeHeaders in the bucket CORS configuration.', { retryable: false })

  return etag
}

/**
 * Upload straight to S3 (or any store with presigned URLs: R2, MinIO, GCS XML API) with no SDK. A file up to `partSize` is one
 * `PUT` to the URL `presign` returns. A bigger file uses multipart if you give `multipart`: your server creates the upload and
 * signs each part, the browser sends the parts directly (with progress) and your server completes it. Every URL must be scoped by
 * your server: one key, one method, a short expiry, and for single uploads a content-length range. After each part the state (upload
 * id and the parts with their ETags) is saved with `saveResumeState`, so a retry or a reload (with the state persisted) continues
 * with the missing parts; `list` lets the server confirm which parts exist.
 *
 * @example typeof s3Transport({ presign: async () => ({ url: 'https://example.invalid/key' }) }).upload // => 'function'
 */
export function s3Transport(options: S3TransportOptions): Transport {
  if (typeof options !== 'object' || options === null || typeof options.presign !== 'function') throw new TypeError('[Pyreon] s3Transport: expected { presign: (file) => Promise<{ url, headers? }> }.')
  const parallel = options.parallel ?? 3

  if (!Number.isInteger(parallel) || parallel < 1) throw new RangeError(`[Pyreon] s3Transport: parallel must be a whole number from 1, got ${String(options.parallel)}.`)
  if (options.partSize !== undefined && (!Number.isInteger(options.partSize) || options.partSize < 1)) throw new RangeError(`[Pyreon] s3Transport: partSize must be a whole number of bytes, got ${String(options.partSize)}.`)

  return {
    async upload(file, ctx) {
      const common = { withCredentials: options.withCredentials === true, signal: ctx.signal }
      const partSize = Math.max(options.partSize ?? 8 * 1024 * 1024, suggestChunkSize(file.size, { minSize: 5 * 1024 * 1024 }))
      const multipart = options.multipart

      if (multipart === undefined || file.size <= partSize) {
        const target = await options.presign(file)

        await sendPart({ url: target.url, method: target.method ?? 'PUT', headers: target.headers ?? {}, body: file.file, size: file.size, onProgress: ctx.onProgress, ...common })

        return { url: target.url.split('?')[0], size: file.size }
      }
      let state = asState(ctx.resumeState)

      try {
        if (state !== null && multipart.list !== undefined) state.parts = await multipart.list(file, { uploadId: state.uploadId })
        if (state === null) state = { uploadId: (await multipart.create(file)).uploadId, partSize, parts: [] }
        const current = state
        const sent = new Map<number, number>()
        const total = chunkCount(file.size, current.partSize)
        const report = (): void => {
          let bytes = 0

          for (const p of current.parts) bytes += chunkRange(file.size, current.partSize, p.partNumber - 1).end - chunkRange(file.size, current.partSize, p.partNumber - 1).start
          for (const v of sent.values()) bytes += v
          ctx.onProgress(bytes)
        }

        ctx.saveResumeState({ ...current, parts: [...current.parts] })
        report()
        const todo = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !current.parts.some((p) => p.partNumber === n))

        await pool(todo, parallel, async (partNumber) => {
          const range = chunkRange(file.size, current.partSize, partNumber - 1)
          const target = await multipart.signPart(file, { uploadId: current.uploadId, partNumber })
          const response = await sendPart({ url: target.url, method: target.method ?? 'PUT', headers: target.headers ?? {}, body: file.file.slice(range.start, range.end), size: range.end - range.start, onProgress: (n) => {
            sent.set(partNumber, n)
            report()
          }, ...common })

          sent.delete(partNumber)
          current.parts.push({ partNumber, etag: etagOf(response.headers) })
          ctx.saveResumeState({ ...current, parts: [...current.parts] })
          report()
        })

        return await multipart.complete(file, { uploadId: current.uploadId, parts: [...current.parts].sort((a, b) => a.partNumber - b.partNumber) })
      } catch (error) {
        const reason = stopReason(ctx)

        if ((reason === 'cancel' || reason === 'remove') && state !== null && multipart.abort !== undefined) void multipart.abort(file, { uploadId: state.uploadId }).catch(() => {})
        throw error
      }
    },
  }
}
