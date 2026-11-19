---
title: Upload
description: File selection, validation, preview and upload with progress as signals for Pyreon — a queue with retry, pause and concurrency, real XHR progress, drop and picker state
---

<PackageBadge name="@pyreon/upload" href="/docs/upload" />

`@pyreon/upload` is the part of a file upload that is the same in every app: choosing files, checking them, uploading them with real progress, retrying what a retry can fix, and cleaning up after itself. The state is signals (status, progress, speed, time left, error, preview) so a progress bar or a file list is a few lines of JSX. It has no UI: you bring the markup.

> **Experimental.** This page covers the core, the queue, the transports (XHR, chunked, S3, tus), resume state, the picker and the drop zone. Headless components come in a follow-up release.

## Installation

:::code-group

```bash [npm]
npm install @pyreon/upload @pyreon/reactivity
```

```bash [bun]
bun add @pyreon/upload @pyreon/reactivity
```

```bash [pnpm]
pnpm add @pyreon/upload @pyreon/reactivity
```

```bash [yarn]
yarn add @pyreon/upload @pyreon/reactivity
```

:::

| Entry | Depends on | What |
| --- | --- | --- |
| `@pyreon/upload/core` | nothing | Validation, `sniffType`, chunk planning, progress math, the error taxonomy. Pure functions. |
| `@pyreon/upload` | `@pyreon/reactivity` | The core, plus `createUploader` / `useUploader`, `useFilePicker` and `useFileDrop`. |
| `@pyreon/upload/transport-xhr` | nothing | `xhrTransport`: one request per file with real upload progress. |
| `@pyreon/upload/transport-chunked` | nothing | `chunkedTransport`: resumable parts with a small server contract. |
| `@pyreon/upload/transport-s3` | nothing | `s3Transport`: presigned single and multipart uploads, no SDK. |
| `@pyreon/upload/transport-tus` | nothing | `tusTransport`: the tus 1.0 protocol. |

## What exists already, and how this fits

- **`@pyreon/http`** is fetch-based: `fetch` has no upload progress event, so it cannot report bytes sent. It has a pluggable transport and a middleware chain, and a request carries a free-form `meta` object. `xhrTransport({ client })` uses exactly that: it sends through your http client with an XHR transport, so the client's base URL, headers and middleware (auth, logging, tracing) apply to the upload, while progress comes back through `meta`. `@pyreon/upload` does not import `@pyreon/http`: the client is described structurally.
- **`@pyreon/form`** already has file fields (`register(field, { type: 'file' })`, the value is a `FileList | null`). The form adapter that gives a file field validation messages from these rules comes with the components release.
- **`@pyreon/validate`** has no file schema; the rules here (`maxSize`, `accept`, dimensions, sniffing) are the file rules, and they run in the browser where the `File` is.
- **`@pyreon/dnd`** wraps a native-drag library for lists and boards. A file dropped from outside the page is a native drag event with a `DataTransfer`, so `useFileDrop` uses those events directly.
- **The private `FileUploadBase` primitive** in `@pyreon/ui-primitives` filters by `accept`, size and count. It drops files silently (no reason is reported), matches types case-sensitively, and uses `dragover` and `dragleave` without counting, so its drop state flickers over child elements. `@pyreon/upload/core` validates with reasons and counts enter and leave; the primitive can adopt `validateFile` and `useFileDrop` in a follow-up.

## Quick start

```ts
// @check
import { createUploader } from '@pyreon/upload'
import { xhrTransport } from '@pyreon/upload/transport-xhr'

const uploader = createUploader({
  transport: xhrTransport({ url: '/api/upload' }),
  rules: { maxSize: '10 MB', accept: ['image/*'], maxFiles: 5 },
})

uploader.status() // => 'idle'
uploader.files() // => []
```

Add files from an `<input>`, a drop or a paste; the queue validates them and starts uploading:

```tsx
// @check
import { createUploader, useFileDrop, useFilePicker } from '@pyreon/upload'
import { xhrTransport } from '@pyreon/upload/transport-xhr'

const uploader = createUploader({ transport: xhrTransport({ url: '/api/upload' }), rules: { maxSize: '10 MB', accept: ['image/*'] } })
const picker = useFilePicker({ accept: ['image/*'], multiple: true, onPick: (files) => uploader.add(files) })
const drop = useFileDrop({ accept: ['image/*'], onDrop: (files) => uploader.add(files) })

export function Uploads() {
  return (
    <div {...drop.dropProps} class={() => (drop.isOver() ? 'zone over' : 'zone')}>
      <input {...picker.inputProps} />
      <button type="button" onClick={() => picker.open()}>
        Choose files
      </button>
      <ul>
        {() =>
          uploader.files().map((f) => (
            <li>
              {f.name} {() => `${Math.round(f.progress().ratio * 100)}%`} {() => f.status()}
              <button type="button" onClick={() => uploader.cancel(f.id)}>Cancel</button>
            </li>
          ))
        }
      </ul>
    </div>
  )
}
```

## Validation

`validateFile(file, rules)` returns an array of rejections (empty means accepted), synchronously unless a rule has to look inside the file. Every rejection has a `code`, a plain English `message` and `params` (sizes, limits, names) so an app can translate with its own i18n.

```ts
// @check
import { validateFile } from '@pyreon/upload/core'

const photo = new File([new Uint8Array(5000)], 'cat.png', { type: 'image/png' })

validateFile(photo, { maxSize: '10 KB', accept: ['image/*'] }) // => []
validateFile(photo, { maxSize: '1 KB' })[0].code // => 'too-large'
validateFile(photo, { maxSize: '1 KB' })[0].message // => 'The file is 5 KB; the limit is 1 KB.'
validateFile(photo, { maxSize: '1 KB' })[0].params // => { size: 5000, max: 1000, name: 'cat.png' }
validateFile(photo, { accept: ['.pdf'] })[0].code // => 'type'
```

Sizes are bytes or text: `"10 MB"` is 10,000,000 (KB, MB, GB, TB are decimal) and `"10 MiB"` is 10,485,760 (KiB, MiB, GiB, TiB are binary). `accept` takes what the HTML attribute takes: MIME types, wildcards such as `image/*` and extensions such as `.csv`, compared without regard to case; a file with no type matches only an extension. `maxFiles` counts across the queue (`validateFiles` for a batch). `image` (`maxWidth`, `minHeight`, `aspect`) decodes the image, `custom` runs your own check; both make the answer a Promise.

### Sniffing the real type

A file's `type` and its extension are what the user's machine claims. `sniffType` reads the first bytes (never the whole file) and recognises the common types by magic number, so `accept: ['image/*']` is not fooled by a renamed executable. Set `sniff: true` in the rules to apply it:

```ts
// @check
import { sniffBytes } from '@pyreon/upload/core'

sniffBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // => 'image/png'
sniffBytes(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])) // => 'application/x-msdownload'
sniffBytes(new TextEncoder().encode('just text')) // => null
```

Known: PNG, JPEG, GIF, WebP, BMP, ICO, TIFF, AVIF, HEIC, PDF, ZIP (also DOCX, XLSX, PPTX), GZIP, 7z, RAR, MP4, WebM, MP3, OGG, WAV, FLAC, Windows executables, ELF and SVG. `null` means "cannot tell", not "safe": a polyglot file can start like a PNG and be something else. It is a convenience for the interface and never the only check.

## The queue

`createUploader(options)` returns a queue. Files are `UploadFile` items: plain data (`id`, `file`, `name`, `size`, `type`, `meta`) and functions that read signals.

| Read | What it is |
| --- | --- |
| `status()` | `queued`, `validating`, `rejected`, `uploading`, `paused`, `done`, `failed` or `cancelled` |
| `progress()` | `{ loaded, total, ratio }` in bytes; never goes backwards |
| `speed()`, `remaining()` | smoothed bytes per second and milliseconds left; `null` until measurable |
| `error()` | `{ kind, message, status?, retryable, retryAfter?, body? }` |
| `result()` | what the transport resolved with (a URL, an id) |
| `preview()` | an object URL for images and videos when `preview` is on |
| `attempt()`, `rejections()` | tries made; the reasons a file was rejected |

The queue has `add`, `remove`, `clear`, `start`, `pause`, `resume`, `cancel`, `retry`, and the aggregates `progress()`, `status()` and `isUploading()`. Options: `concurrency` (default 3, a whole number from 1), `autoStart` (default true), `retry`, `pauseWhenOffline` (default true), `meta`, `preview`, `keepRejected`, `dedupe`, and the callbacks `onDone`, `onError`, `onReject`, `onAllDone`.

```ts
// @check
import { createUploader } from '@pyreon/upload'
import type { Transport } from '@pyreon/upload'

const fake: Transport = { upload: async (file) => `/files/${file.name}` }
const uploader = createUploader({ transport: fake, rules: { maxSize: 100 }, preview: false })
const [ok, tooBig] = uploader.add([new File(['hello'], 'a.txt'), new File([new Uint8Array(500)], 'big.bin')])

tooBig.status() // => 'rejected'
tooBig.rejections()[0].code // => 'too-large'
tooBig.error().kind // => 'rejected'
uploader.files().length // => 2
ok.status() // => 'uploading'
uploader.dispose()
```

Rejected files stay in the list with their reasons (set `keepRejected: false` to drop them; `onReject` still fires). Created inside a component the queue is disposed with it; otherwise call `dispose()`.

### Progress that never goes back

`progress()` never decreases. After a retry the transport restarts from zero on the wire, but the number you see holds at its high-water mark until the new attempt passes it. Cancelling and then calling `retry` is a new upload and starts at zero. Progress is written to the signals once per animation frame (or every 100 ms when frames are not running), however often a transport reports: a transport that reports ten thousand events costs a handful of signal writes. Speed is smoothed and appears once two measurements 250 ms apart exist.

### Retry, back-off and offline

The queue retries only failures a retry can fix: network errors, timeouts, 408, 425, 429 and 5xx. It never retries another 4xx (a validation, auth or size problem will not go away), an error a transport marks non-retryable, an unknown thrown error or an abort. `retry: { attempts, backoff }` sets the tries in total, the first included (default 3), and the delay after attempt `n` (default 500 ms doubling to a minute, with jitter). A `Retry-After` header, in seconds or as an HTTP date, is honoured when it asks for longer. A retrying file goes to the back of the line, so a file that keeps failing cannot starve the others. `retry: false` never retries.

```ts
// @check
import { errorFromStatus, isRetryableStatus, parseRetryAfter } from '@pyreon/upload/core'

isRetryableStatus(503) // => true
isRetryableStatus(422) // => false
parseRetryAfter('120') // => 120000
parseRetryAfter('Wed, 18 Nov 2026 10:00:30 GMT', Date.parse('2026-11-18T10:00:00Z')) // => 30000
errorFromStatus(429, { retryAfter: '3', body: { error: 'slow down' } }) // => { kind: 'server', message: 'The server answered 429.', status: 429, retryable: true, retryAfter: 3000, body: { error: 'slow down' } }
```

While the browser reports itself offline the queue pauses uploads and resumes them when it is back. `pause()`, `resume()` and `cancel()` use an `AbortSignal` per attempt: the transport gets `ctx.signal` and must stop when it aborts. A transport that never settles cannot block the queue: the queue moves on when you pause, cancel or remove the file, and ignores a late answer.

### Cleaning up

`dispose()` aborts every request in flight, clears the retry and frame timers, removes the `online` and `offline` listeners and revokes every preview URL. It runs by itself when the queue was created in a component. The real-Chromium tests of the package check this with instrumented timers, listeners, `URL.createObjectURL` and a server that counts open requests.

## The XHR transport

`xhrTransport({ url })` sends each file as one multipart request (the file in the `file` field, the `meta` as text fields) with `XMLHttpRequest`, reporting bytes sent. Why XHR: `fetch` has no upload progress event, and streaming request bodies need HTTP/2 and are not available everywhere, so XHR is the reliable baseline.

```ts
// @check
import { xhrTransport } from '@pyreon/upload/transport-xhr'

const transport = xhrTransport({
  url: (file) => `/api/albums/${String(file.meta.album)}/photos`,
  field: 'photo',
  headers: async () => ({ authorization: `Bearer ${await getToken()}` }),
  withCredentials: true,
  timeout: 60_000,
})

async function getToken(): Promise<string> {
  return 'token'
}

typeof transport.upload // => 'function'
```

A 2xx answer resolves with the parsed body (JSON when the server says so). Other statuses become typed errors with the parsed body, so a 422 that says which field was wrong reaches `file.error().body`. `body: (file) => FormData | Blob` builds the body yourself (a `Blob` for a raw upload, as a presigned URL expects).

### Through an `@pyreon/http` client

Pass `client` and the upload goes through the client's chain: base URL, headers, middleware.

```ts
// @check
import { createHttp } from '@pyreon/http'
import { xhrTransport } from '@pyreon/upload/transport-xhr'

const api = createHttp({ baseUrl: 'https://api.example.com', headers: () => ({ authorization: 'Bearer token' }) })
const transport = xhrTransport({ client: api, url: '/photos' })

typeof transport.upload // => 'function'
```

## Resumable uploads

A big file over a flaky connection should not start over. The three resumable transports send the file in parts with `Blob.slice` (never reading it whole), report real progress for each part, and save a small resume state after every part (`saveResumeState`). A retry, a pause and a page reload (with the state persisted) continue from the parts the server already has. Each transport is its own entry, so only the one you use is bundled; they do not import each other.

### The chunked contract and a reference handler

`chunkedTransport({ url, chunkSize, parallel, checksum })` speaks a small contract (`BASE` is `url`):

| Request | Body | Answer |
| --- | --- | --- |
| `POST BASE` | JSON `{ name, size, type, chunkSize, meta }` | `{ uploadId }` (200 or 201); may add `chunkSize` |
| `GET BASE/:uploadId` | | `{ received: number[] }`: the parts it has (used to resume; the server's list wins over the saved state) |
| `PUT BASE/:uploadId/parts/:n` | the raw bytes of part `n` (from 0); with `checksum: 'sha-256'` the header `x-part-sha256` is the part's hex digest | 2xx; putting a part twice is harmless |
| `POST BASE/:uploadId/complete` | `{ parts }` | the result (JSON), which becomes `file.result()`; 409 `{ missing }` if parts are missing |
| `DELETE BASE/:uploadId` | | 204; sent when the file is cancelled or removed |

Retries are the queue's: 408, 429 and 5xx are retried, other 4xx (a 422 for a bad checksum, say) are not. This is a complete handler for it, written against the standard `Request` and `Response` so it runs in any server or edge runtime and as a `@pyreon/zero` server route with no other code. It keeps parts in memory to stay short: store them on disk or in object storage in a real server, and check size, type and content on `complete`. The package's tests run exactly this file as the server of the Chromium tests (a test checks that the code on this page is that file).

```ts
// The reference handler of the chunked contract, as shown in the docs (the docs test checks this file is the code on the page).
// It keeps parts in memory to stay short: store them on disk or in object storage in a real server.

interface Upload {
  name: string
  size: number
  chunkSize: number
  parts: Map<number, Uint8Array>
}

const uploads = new Map<string, Upload>()
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Handle `POST /`, `GET /:id`, `PUT /:id/parts/:n`, `POST /:id/complete` and `DELETE /:id` under `base`. */
export async function chunkedHandler(request: Request, base = '/api/uploads'): Promise<Response> {
  const path = new URL(request.url).pathname.slice(base.length).split('/').filter(Boolean)
  const [id, kind, n] = path
  const upload = id === undefined ? undefined : uploads.get(id)

  if (id === undefined && request.method === 'POST') {
    const info = (await request.json()) as { name: string; size: number; chunkSize: number }
    const uploadId = crypto.randomUUID()

    uploads.set(uploadId, { name: info.name, size: info.size, chunkSize: info.chunkSize, parts: new Map() })

    return json({ uploadId }, 201)
  }
  if (upload === undefined) return json({ error: 'unknown upload' }, 404)
  if (request.method === 'GET' && kind === undefined) return json({ received: [...upload.parts.keys()] })
  if (request.method === 'DELETE' && kind === undefined) {
    uploads.delete(id!)

    return new Response(null, { status: 204 })
  }
  if (request.method === 'PUT' && kind === 'parts') {
    const bytes = new Uint8Array(await request.arrayBuffer())
    const expected = request.headers.get('x-part-sha256')

    if (expected !== null) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))

      if ([...digest].map((b) => b.toString(16).padStart(2, '0')).join('') !== expected) return json({ error: 'checksum mismatch' }, 422)
    }
    upload.parts.set(Number(n), bytes)

    return new Response(null, { status: 204 })
  }
  if (request.method === 'POST' && kind === 'complete') {
    const count = Math.max(1, Math.ceil(upload.size / upload.chunkSize))
    const missing = Array.from({ length: count }, (_, i) => i).filter((i) => !upload.parts.has(i))

    if (missing.length > 0) return json({ missing }, 409)
    const size = [...upload.parts.values()].reduce((sum, p) => sum + p.length, 0)

    if (size !== upload.size) return json({ error: 'size mismatch', size }, 422)
    uploads.delete(id!)

    return json({ name: upload.name, size })
  }

  return json({ error: 'not found' }, 404)
}

/** For the tests: how many uploads are still open. */
export const openUploads = (): number => uploads.size
```

In a `@pyreon/zero` server route, forward the request: `export const POST = (request: Request) => chunkedHandler(request)`, and likewise for `GET`, `PUT` and `DELETE`.

```ts
// @check
import { chunkedTransport } from '@pyreon/upload/transport-chunked'

const transport = chunkedTransport({ url: '/api/uploads', chunkSize: 5 * 1024 * 1024, parallel: 3, checksum: 'sha-256' })

typeof transport.upload // => 'function'
```

### Direct to S3 with presigned URLs

`s3Transport` needs no AWS SDK in the browser. You give it functions that call your server; your server signs. A file up to `partSize` (8 MiB by default, at least 5 MiB, never more than 10,000 parts) is one presigned `PUT`; a bigger one is a multipart upload.

```ts
// @check
import { s3Transport } from '@pyreon/upload/transport-s3'

const post = async (path: string, body?: unknown): Promise<any> => (await fetch(`/api/s3${path}`, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).json()

const transport = s3Transport({
  presign: (file) => post(`/sign?key=${encodeURIComponent(file.name)}`),
  multipart: {
    create: (file) => post(`/create?key=${encodeURIComponent(file.name)}`),
    signPart: (_file, part) => post(`/sign-part?uploadId=${part.uploadId}&partNumber=${part.partNumber}`),
    complete: (_file, upload) => post(`/complete?uploadId=${upload.uploadId}`, { parts: upload.parts }),
    abort: async (_file, upload) => void (await fetch(`/api/s3/abort?uploadId=${upload.uploadId}`, { method: 'DELETE' })),
    list: async (_file, upload) => (await fetch(`/api/s3/list?uploadId=${upload.uploadId}`)).json(),
  },
})

typeof transport.upload // => 'function'
```

On the server (the AWS SDK v3, shown for orientation; the package's tests run a server that mimics this contract, not AWS itself):

```ts
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, ListPartsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3 = new S3Client({})

// POST /sign?key=...  and  POST /sign-part?uploadId=...&partNumber=...
await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key }), { expiresIn: 300 })
await getSignedUrl(s3, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 300 })
// POST /create, /complete and DELETE /abort call CreateMultipartUpload, CompleteMultipartUpload (Parts: [{ PartNumber, ETag }]) and AbortMultipartUpload.
```

Things that must be true: the key is chosen by your server (never by the client's file name), each URL is one key and one method with a short expiry, and the bucket's CORS rule lists `ETag` in `ExposeHeaders` (the transport reads each part's ETag and says so if it is missing). Cancelling a file calls `abort`; `list` lets a resumed upload ask S3 which parts exist.

### tus

`tusTransport({ endpoint })` implements the tus 1.0 protocol with the creation and termination extensions, so any tus server (tusd, the Node and Go servers, Cloudflare Stream, Vimeo) works: `POST` creates the upload with its length and metadata, `PATCH` sends each part at the right offset, `HEAD` asks where the server is when resuming, `DELETE` terminates a cancelled upload. A saved URL that the server has forgotten (404 or 410) or that has another length starts a new upload.

```ts
// @check
import { tusTransport } from '@pyreon/upload/transport-tus'

const transport = tusTransport({ endpoint: 'https://tus.example.com/files', chunkSize: 5 * 1024 * 1024, metadata: (file) => ({ filename: file.name, filetype: file.type }) })

typeof transport.upload // => 'function'
```

### Continuing after a page reload

Pass a resume store to the queue. It saves the transport's state by file fingerprint (name, size, type, last modified), loads it when the same file is added again, and clears it when the upload finishes, fails for good, or is cancelled or removed. Entries expire after seven days by default. The store takes anything with `getItem`, `setItem` and `removeItem`: `localStorage`, or an `@pyreon/storage` adapter.

```ts
// @check
import { createResumeStore, createUploader } from '@pyreon/upload'
import { tusTransport } from '@pyreon/upload/transport-tus'

const memory = new Map<string, string>()
const store = createResumeStore({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) })
const video = new File([new Uint8Array(10)], 'holiday.mp4', { type: 'video/mp4', lastModified: 1 })

store.save({ name: video.name, size: video.size, type: video.type, file: video }, { url: 'https://tus.example.com/files/abc' })
store.load({ name: video.name, size: video.size, type: video.type, file: video }) // => { url: 'https://tus.example.com/files/abc' }

const uploader = createUploader({ transport: tusTransport({ endpoint: 'https://tus.example.com/files' }), resume: store, autoStart: false })
const [added] = uploader.add([video])

added.status() // => 'queued'
uploader.dispose()
```

A resumable video upload that survives a reload is therefore: `createUploader({ transport: tusTransport(...) or chunkedTransport(...), resume: createResumeStore(localStorage) })`, the same `add` call after the reload (the browser asks the user to choose the file again, and the fingerprint finds the saved state), and nothing else. The real-Chromium tests of the package do exactly this against the in-test servers: they upload part of a file, dispose the queue, create a new one with the same store, and check that the finished parts are not sent again.

## The file picker

`useFilePicker({ multiple, accept, directory, capture, onPick, onCancel })` is the state of a picker. `open()` opens the system dialog (call it from a click or key handler); spread `inputProps` on an `<input>` you render, or render none and `open()` makes a detached one. The input is emptied after each pick, after the files are copied out, so choosing the same file twice works (a browser does not fire `change` when the same path is chosen again, unless the value was cleared). A cancelled dialog is reported through `onCancel`.

## The drop zone

`useFileDrop({ accept, multiple, disabled, directories, paste, onDrop, onReject })` returns `dropProps` to spread on the zone, `isOver()` and `isValid()`.

- Enter and leave are counted, so moving over the zone's children does not make it flicker.
- While dragging, `isValid()` judges the dragged types against `accept` (a browser tells only the MIME type during a drag, not the name; an item with no type passes) and the count against `multiple`.
- Dropped folders are read and flattened when the browser supports `webkitGetAsEntry`.
- `paste: true` also takes files pasted onto the element (it must be focusable to receive paste) and leaves pasted text alone.
- Accepted files go to `onDrop`, the others to `onReject` with a code.

A drag that ends outside the zone resets it. `dropProps` carries `data-drag-over` and `data-drop-valid` for styling.

Why not `@pyreon/dnd`: a file dragged in from the desktop is a native drag event carrying a `DataTransfer`, not an item of your page, so the native events are the right tool.

## Security notes

- **Client validation is user experience, not security.** A client can send anything. The server must check the type, the size and the content of every upload, and enforce its own limits.
- **Never trust `file.type` or the extension.** They are what the sender's machine claims. `sniff: true` helps the interface; the server should check the content too.
- **Filenames are untrusted.** Show them as text (`{file.name}` in JSX, never `innerHTML`), and on the server do not use them as paths: generate your own storage key. Names can contain path separators, control characters and right-to-left marks.
- **Scope presigned URLs** to one key, one method, a short expiry and a content-length range.
- **Revoke object URLs.** `preview: true` does it for you; your own `URL.createObjectURL` calls are yours to revoke.
- **Do not read a whole file into memory** (`FileReader`, `arrayBuffer()`) to upload it: pass the `File` to a transport, which sends it from disk. Chunking uses `Blob.slice`.

## Formatting numbers for display

`file.size` and `progress()` are numbers. For text use `Intl` (or `@pyreon/format` when you have it):

```ts
// @check
import { formatSize } from '@pyreon/upload/core'

formatSize(1_500_000) // => '1.5 MB'
new Intl.NumberFormat('en', { style: 'percent' }).format(0.42) // => '42%'
```

## Coming from

| You use | Here |
| --- | --- |
| Uppy `new Uppy({ restrictions: { maxFileSize, allowedFileTypes, maxNumberOfFiles } })` | `rules: { maxSize, accept, maxFiles }` on `createUploader` |
| Uppy XHRUpload plugin | `xhrTransport({ url })` |
| Uppy `uppy.on('upload-progress')` | `file.progress()` in an effect or JSX; no event to subscribe to or unsubscribe from |
| FilePond `FilePond.create()` | `createUploader()` plus your own markup; the state is signals |
| react-dropzone `useDropzone({ accept, maxFiles, onDrop })` | `useFileDrop({ accept, multiple, onDrop })`; `isDragActive` is `isOver()`, `isDragReject` is `isValid() === false` |
| react-dropzone `fileRejections` | `onReject` and `file.rejections()` with `code`, `message` and `params` |
| tus-js-client `new tus.Upload(file, { endpoint, chunkSize, metadata, retryDelays })` | `tusTransport({ endpoint, chunkSize, metadata })`; retries are the queue's `retry` option; `upload.start()` is `uploader.add`, `abort` is `pause`, `terminate` is `cancel` |
| Uppy AwsS3 plugin (`getUploadParameters`, `createMultipartUpload`, `signPart`, `completeMultipartUpload`) | `s3Transport({ presign, multipart: { create, signPart, complete, abort, list } })`: the same five questions, as plain functions |
