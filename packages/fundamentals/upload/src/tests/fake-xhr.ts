/**
 * An in-memory `XMLHttpRequest` for the unit runner. It keeps the parts of the real contract the transports rely on, and the
 * test plays the server: it reads what was sent (`method`, `url`, `headers`, `body`) and answers with progress, a response, a
 * network error, a timeout, or nothing at all.
 *
 * Fidelity kept on purpose, because a laxer double would let a transport bug through:
 * - `abort()` on a sent request fires `onabort` synchronously, as the real one does, and a request that already settled ignores it;
 * - `responseText` throws unless `responseType` is `''` or `'text'`, and `response` is an `ArrayBuffer` for `'arraybuffer'`;
 * - `getResponseHeader` is case-insensitive and returns `null` for a missing header; `getAllResponseHeaders` is CRLF-joined;
 * - `setRequestHeader` before `open()` throws (`InvalidStateError`);
 * - an event fired after the request settled is dropped (a real XHR emits nothing after `loadend`).
 *
 * This is a double of the browser boundary, not of the transport: the transports run unchanged on top of it. The real path is
 * covered in Chromium by `upload.browser.test.ts` (and, from slice 2, `resumable.browser.test.ts`) against real servers.
 */

type Handler = ((this: XMLHttpRequest, ev: ProgressEvent) => unknown) | null

export interface FakeResponse {
  status: number
  body?: string | ArrayBuffer | Uint8Array
  headers?: Record<string, string>
}

const progressEvent = (loaded: number, total: number, lengthComputable: boolean): ProgressEvent =>
  ({ loaded, total, lengthComputable, type: 'progress' }) as unknown as ProgressEvent

export class FakeXhr {
  /** Every request made since the last `install()`, in order. */
  static requests: FakeXhr[] = []
  /** Called when a request is sent: lets a test answer automatically (a scripted server). */
  static onSend: ((xhr: FakeXhr) => void) | null = null

  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown = undefined
  sent = false
  aborted = false
  done = false
  opened = false

  withCredentials = false
  timeout = 0
  responseType: XMLHttpRequestResponseType = ''
  status = 0
  readyState = 0

  onload: Handler = null
  onerror: Handler = null
  ontimeout: Handler = null
  onabort: Handler = null
  upload: { onprogress: Handler } = { onprogress: null }

  private responseHeaders: Record<string, string> = {}
  private rawBody: string | ArrayBuffer | Uint8Array = ''

  constructor() {
    FakeXhr.requests.push(this)
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
    this.opened = true
    this.readyState = 1
  }

  setRequestHeader(name: string, value: string): void {
    if (!this.opened || this.sent) throw new DOMException('The object is in an invalid state.', 'InvalidStateError')
    this.headers[name.toLowerCase()] = value
  }

  send(body?: unknown): void {
    if (!this.opened || this.sent) throw new DOMException('The object is in an invalid state.', 'InvalidStateError')
    this.sent = true
    this.body = body
    FakeXhr.onSend?.(this)
  }

  abort(): void {
    if (!this.sent || this.done) return
    this.aborted = true
    this.done = true
    this.readyState = 4
    this.status = 0
    this.onabort?.call(this as unknown as XMLHttpRequest, progressEvent(0, 0, false))
  }

  get responseText(): string {
    if (this.responseType !== '' && this.responseType !== 'text') throw new DOMException('responseText is only available if responseType is "" or "text".', 'InvalidStateError')
    if (typeof this.rawBody === 'string') return this.rawBody

    return new TextDecoder().decode(this.rawBody)
  }

  get response(): unknown {
    if (this.responseType === 'arraybuffer') {
      if (typeof this.rawBody === 'string') return new TextEncoder().encode(this.rawBody).buffer
      if (this.rawBody instanceof Uint8Array) return this.rawBody.buffer.slice(this.rawBody.byteOffset, this.rawBody.byteOffset + this.rawBody.byteLength)

      return this.rawBody
    }

    return this.responseText
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null
  }

  getAllResponseHeaders(): string {
    return Object.entries(this.responseHeaders).map(([k, v]) => `${k}: ${v}\r\n`).join('')
  }

  // ---- the server side, driven by the test ----

  /** Report bytes sent. `total` defaults to the body's size when it has one. */
  progress(loaded: number, total = 0, lengthComputable = total > 0): void {
    if (this.done) return
    this.upload.onprogress?.call(this as unknown as XMLHttpRequest, progressEvent(loaded, total, lengthComputable))
  }

  respond(response: FakeResponse): void {
    if (this.done) return
    this.done = true
    this.readyState = 4
    this.status = response.status
    this.rawBody = response.body ?? ''
    this.responseHeaders = Object.fromEntries(Object.entries(response.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    this.onload?.call(this as unknown as XMLHttpRequest, progressEvent(0, 0, false))
  }

  /** The connection failed (DNS, refused, CORS): status 0 and an `error` event. */
  fail(): void {
    if (this.done) return
    this.done = true
    this.readyState = 4
    this.onerror?.call(this as unknown as XMLHttpRequest, progressEvent(0, 0, false))
  }

  /** The `timeout` the transport set elapsed. */
  expire(): void {
    if (this.done) return
    this.done = true
    this.readyState = 4
    this.ontimeout?.call(this as unknown as XMLHttpRequest, progressEvent(0, 0, false))
  }

  /** A request header, case-insensitive. */
  header(name: string): string | undefined {
    return this.headers[name.toLowerCase()]
  }

  /** The multipart body as entries (strings for text parts, `File` for files). */
  formEntries(): [string, FormDataEntryValue][] {
    if (!(this.body instanceof FormData)) throw new Error(`expected a FormData body, got ${String(this.body)}`)

    return [...this.body.entries()]
  }
}

/** Replace the global `XMLHttpRequest` with the double. Returns the request list; call `restore()` in `afterEach`. */
export function installFakeXhr(): { requests: FakeXhr[]; last(): FakeXhr; restore(): void } {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'XMLHttpRequest')
  const previous = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest

  FakeXhr.requests = []
  FakeXhr.onSend = null
  ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr

  return {
    requests: FakeXhr.requests,
    last() {
      const r = FakeXhr.requests[FakeXhr.requests.length - 1]

      if (r === undefined) throw new Error('no XMLHttpRequest was made')

      return r
    },
    restore() {
      FakeXhr.onSend = null
      if (had) (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = previous
      else delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest
    },
  }
}

/** Let promise callbacks (an awaited header function, a `send` after an await) run. */
export const tick = async (n = 10): Promise<void> => {
  for (let i = 0; i < n; i++) await Promise.resolve()
}
