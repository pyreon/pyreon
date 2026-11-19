// pyreon-lint-disable-file pyreon/no-window-in-ssr -- an upload request is only ever sent in the browser, after the user picked a file
// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- the abort listener is on an AbortSignal and is removed when the request settles
import { errorFromStatus, uploadError } from './errors'
import type { TransportContext } from './types'

/** The answer to one request of a resumable transport. */
export interface PartResponse {
  status: number
  headers: Headers
  body: unknown
  text: string
}

export interface PartRequest {
  url: string
  method: string
  headers?: Record<string, string>
  body?: XMLHttpRequestBodyInit | null
  /** Bytes of the body, for progress. */
  size?: number
  withCredentials?: boolean
  timeout?: number
  /** Called with bytes of this body sent. */
  onProgress?(loaded: number): void
  signal: AbortSignal
}

function parseHeaders(raw: string): Headers {
  const headers = new Headers()

  for (const line of raw.trim().split(/\r?\n/)) {
    const i = line.indexOf(':')

    if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim())
  }

  return headers
}

function parse(text: string, type: string | null): unknown {
  if (text === '') return undefined
  if (type !== null && /json/i.test(type)) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  return text
}

/**
 * One request with XMLHttpRequest, resolved with the status, headers and parsed body for any HTTP answer in `accept` (default
 * 2xx) and rejected with a typed `UploadError` otherwise. Shared by the resumable transports so each part reports upload
 * progress and aborts with the signal.
 */
export function sendPart(req: PartRequest, accept: (status: number) => boolean = (s) => s >= 200 && s < 300): Promise<PartResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const stop = (): void => req.signal.removeEventListener('abort', onAbort)
    const fail = (e: ReturnType<typeof uploadError>): void => {
      stop()
      reject(e)
    }
    const onAbort = (): void => xhr.abort()

    xhr.open(req.method, req.url)
    xhr.withCredentials = req.withCredentials === true
    if (req.timeout !== undefined) xhr.timeout = req.timeout
    for (const [k, v] of Object.entries(req.headers ?? {})) xhr.setRequestHeader(k, v)
    if (req.onProgress !== undefined) xhr.upload.onprogress = (e) => req.onProgress!(e.lengthComputable && e.total > 0 && req.size !== undefined ? (e.loaded / e.total) * req.size : e.loaded)
    xhr.onload = () => {
      stop()
      const headers = parseHeaders(xhr.getAllResponseHeaders())
      const text = xhr.responseText
      const body = parse(text, headers.get('content-type'))

      if (accept(xhr.status)) resolve({ status: xhr.status, headers, body, text })
      else reject(errorFromStatus(xhr.status, { retryAfter: headers.get('retry-after'), body }))
    }
    xhr.onerror = () => fail(uploadError('network', 'The network request failed.', { retryable: true }))
    xhr.ontimeout = () => fail(uploadError('timeout', 'The request timed out.', { retryable: true }))
    xhr.onabort = () => fail(uploadError('aborted', 'The upload was cancelled.', { cause: req.signal.reason?.cause }))
    if (req.signal.aborted) return fail(uploadError('aborted', 'The upload was cancelled.', { cause: req.signal.reason?.cause }))
    req.signal.addEventListener('abort', onAbort, { once: true })
    xhr.send(req.body ?? null)
  })
}

/** Why an upload was stopped, from the abort signal: `'cancel'`, `'remove'`, `'pause'`, `'offline'` or `'dispose'`. */
export function stopReason(ctx: Pick<TransportContext, 'signal'>): string | undefined {
  const reason = ctx.signal.reason as { cause?: unknown } | undefined

  return typeof reason?.cause === 'string' ? reason.cause : undefined
}

/** Run `fn` with at most `parallel` of the `items` in flight; stops at the first failure and lets the running ones finish. */
export async function pool<T>(items: readonly T[], parallel: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  let failure: unknown
  let failed = false
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const item = items[next++]!

      try {
        await fn(item)
      } catch (error) {
        if (!failed) {
          failed = true
          failure = error
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, worker))
  if (failed) throw failure
}
