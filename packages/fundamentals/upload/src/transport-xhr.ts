// pyreon-lint-disable-file pyreon/no-window-in-ssr -- this runs only when an upload starts, in the browser; the listeners are on an AbortSignal and an XMLHttpRequest, which are removed when the request settles
// pyreon-lint-disable-file pyreon/no-raw-addeventlistener -- this runs only when an upload starts, in the browser; the listeners are on an AbortSignal and an XMLHttpRequest, which are removed when the request settles
import { errorFromStatus, toUploadError, uploadError } from './errors'
import type { Transport, TransportContext, TransportFile, UploadError } from './types'

type HeaderMap = Record<string, string>

/** The part of an `@pyreon/http` client an upload needs; written structurally so this package does not import `@pyreon/http`. */
export interface UploadHttpClient {
  extend(config: { transport: (request: HttpLikeRequest) => Promise<HttpLikeResponse> }): {
    request(method: 'POST' | 'PUT' | 'PATCH', path: string, options: { body?: BodyInit | null; signal?: AbortSignal; meta?: Record<string, unknown>; timeout?: number | false; headers?: HeadersInit }): PromiseLike<HttpLikeResponse> & { json?: () => Promise<unknown> }
  }
}

interface HttpLikeRequest {
  method: string
  url: string
  headers: Headers
  body: BodyInit | null
  signal: AbortSignal | undefined
  credentials: RequestCredentials | undefined
  meta: Record<string, unknown>
}

interface HttpLikeResponse {
  raw: Response
  status: number
  ok: boolean
  headers: Headers
  request: HttpLikeRequest
}

export interface XhrTransportOptions {
  /** Where to send the file, or a function of the file. With `client`, a path under the client's base URL. */
  url: string | ((file: TransportFile) => string)
  /** Default `POST`. */
  method?: 'POST' | 'PUT' | 'PATCH'
  /** The multipart field name of the file. Default `file`. */
  field?: string
  /** Extra headers, or a function (may be async) for a fresh token per file. Not applied with `client` (use the client's own). */
  headers?: HeaderMap | ((file: TransportFile) => HeaderMap | Promise<HeaderMap>)
  withCredentials?: boolean
  /** Build the body yourself: a `FormData`, or a `Blob` for a raw upload (then no multipart field is added). */
  body?: (file: TransportFile) => FormData | Blob
  /** Milliseconds of total time before the request fails with a `timeout` error. Default none. */
  timeout?: number
  /** Meta entries are appended to the multipart body as text fields. Default true. */
  sendMeta?: boolean
  /** An `@pyreon/http` client: base URL, headers and middleware (auth, logging) then apply to the upload. */
  client?: UploadHttpClient
}

function bodyOf(file: TransportFile, options: XhrTransportOptions): FormData | Blob {
  if (options.body !== undefined) return options.body(file)
  const form = new FormData()

  if (options.sendMeta !== false) for (const [k, v] of Object.entries(file.meta)) if (v !== undefined && v !== null) form.append(k, typeof v === 'string' ? v : JSON.stringify(v))
  form.append(options.field ?? 'file', file.file, file.name || 'file')

  return form
}

/** Parse a response body as JSON when it says it is JSON, else as text; never throws. */
function parseBody(text: string, contentType: string | null): unknown {
  if (text === '') return undefined
  if (contentType !== null && /json/i.test(contentType)) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  return text
}

const toBytes = (file: TransportFile, event: ProgressEvent): number => (event.lengthComputable && event.total > 0 ? (event.loaded / event.total) * file.size : event.loaded)

function sendXhr(file: TransportFile, ctx: TransportContext, options: XhrTransportOptions, headers: HeaderMap): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const url = typeof options.url === 'function' ? options.url(file) : options.url
    const stop = (): void => ctx.signal.removeEventListener('abort', onAbort)
    const fail = (error: UploadError): void => {
      stop()
      reject(error)
    }
    const onAbort = (): void => {
      xhr.abort()
    }

    xhr.open(options.method ?? 'POST', url)
    xhr.withCredentials = options.withCredentials === true
    if (options.timeout !== undefined) xhr.timeout = options.timeout
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => ctx.onProgress(toBytes(file, e))
    xhr.onload = () => {
      stop()
      const body = parseBody(xhr.responseText, xhr.getResponseHeader('content-type'))

      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(errorFromStatus(xhr.status, { retryAfter: xhr.getResponseHeader('retry-after'), body }))
    }
    xhr.onerror = () => fail(uploadError('network', 'The network request failed.', { retryable: true }))
    xhr.ontimeout = () => fail(uploadError('timeout', 'The upload timed out.', { retryable: true }))
    xhr.onabort = () => fail(uploadError('aborted', 'The upload was cancelled.'))
    if (ctx.signal.aborted) return fail(uploadError('aborted', 'The upload was cancelled.'))
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    xhr.send(bodyOf(file, options))
  })
}

/**
 * An XHR transport for http clients: a function with the shape `@pyreon/http` expects of a transport, which sends the request
 * with `XMLHttpRequest` and reports upload progress through `request.meta.onUploadProgress` (bytes). Used by `xhrTransport`
 * when you pass `client`.
 */
export function xhrHttpTransport(): (request: HttpLikeRequest) => Promise<HttpLikeResponse> {
  return (request) =>
    new Promise<HttpLikeResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const onProgress = request.meta.onUploadProgress as ((loaded: number, total: number) => void) | undefined
      const abort = (): void => xhr.abort()
      const signal = request.signal

      xhr.open(request.method, request.url)
      xhr.withCredentials = request.credentials === 'include'
      xhr.responseType = 'arraybuffer'
      request.headers.forEach((value, key) => xhr.setRequestHeader(key, value))
      if (onProgress !== undefined) xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : 0)
      xhr.onload = () => {
        signal?.removeEventListener('abort', abort)
        const headers = new Headers()

        xhr.getAllResponseHeaders().trim().split(/\r?\n/).filter(Boolean).forEach((line) => {
          const i = line.indexOf(':')

          if (i > 0) headers.append(line.slice(0, i).trim(), line.slice(i + 1).trim())
        })
        const nullBody = xhr.status === 204 || xhr.status === 205 || xhr.status === 304
        const raw = new Response(nullBody ? null : (xhr.response as ArrayBuffer), { status: xhr.status, headers })

        resolve({ raw, status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, headers, request })
      }
      xhr.onerror = () => {
        signal?.removeEventListener('abort', abort)
        reject(new TypeError('Failed to fetch'))
      }
      xhr.ontimeout = xhr.onerror
      xhr.onabort = () => {
        signal?.removeEventListener('abort', abort)
        reject(new DOMException('The request was aborted.', 'AbortError'))
      }
      if (signal?.aborted === true) return reject(new DOMException('The request was aborted.', 'AbortError'))
      signal?.addEventListener('abort', abort, { once: true })
      xhr.send(request.body as XMLHttpRequestBodyInit | null)
    })
}

async function viaClient(file: TransportFile, ctx: TransportContext, options: XhrTransportOptions): Promise<unknown> {
  const client = options.client!.extend({ transport: xhrHttpTransport() })
  const path = typeof options.url === 'function' ? options.url(file) : options.url
  const response = client.request(options.method ?? 'POST', path, {
    body: bodyOf(file, options),
    signal: ctx.signal,
    timeout: options.timeout ?? false,
    meta: { onUploadProgress: (loaded: number, total: number) => ctx.onProgress(total > 0 ? (loaded / total) * file.size : loaded) },
  })

  try {
    const res = (await response) as HttpLikeResponse
    const text = await res.raw.text()

    return parseBody(text, res.headers.get('content-type'))
  } catch (error) {
    // `@pyreon/http` throws its own error for a non-2xx answer; it carries the status and the response.
    const e = error as { status?: unknown; response?: { headers?: Headers } } | null

    if (typeof e?.status === 'number') throw errorFromStatus(e.status, { retryAfter: e.response?.headers?.get?.('retry-after') ?? null, body: (error as { body?: unknown }).body })
    throw toUploadError(error)
  }
}

/**
 * Upload each file as one request with `XMLHttpRequest`, reporting real upload progress. Why XHR: `fetch` has no upload
 * progress event (streaming request bodies need HTTP/2 and are not available everywhere), while `XMLHttpRequest` reports bytes
 * sent in every browser. The file is sent as multipart form data (the file in the `field` part, `meta` as text parts) unless you
 * build the body. A 2xx answer resolves with the parsed body (JSON when the server says so); 408, 425, 429 and 5xx are
 * retryable (a `Retry-After` header is honoured), other statuses are not; network failures and timeouts are retryable. Pass
 * `client` to send through an `@pyreon/http` client so its base URL, headers and middleware apply.
 *
 * @example typeof xhrTransport({ url: '/upload' }).upload // => 'function'
 */
export function xhrTransport(options: XhrTransportOptions): Transport {
  if (typeof options !== 'object' || options === null || (typeof options.url !== 'string' && typeof options.url !== 'function')) {
    throw new TypeError('[Pyreon] xhrTransport: expected { url: "/upload" } (or a function returning the URL).')
  }

  return {
    async upload(file, ctx) {
      if (typeof XMLHttpRequest === 'undefined') throw uploadError('network', '[Pyreon] xhrTransport: XMLHttpRequest is not available here; uploads run in the browser.', { retryable: false })
      if (options.client !== undefined) return viaClient(file, ctx, options)
      const given = typeof options.headers === 'function' ? await options.headers(file) : (options.headers ?? {})

      return sendXhr(file, ctx, options, given)
    },
  }
}
