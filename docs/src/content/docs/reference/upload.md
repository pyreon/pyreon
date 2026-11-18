---
title: "@pyreon/upload — API Reference"
description: "File selection, validation, preview and upload with progress as signals: a queue with retry, pause and concurrency, real XHR progress, drop and picker state"
---

> **Generated** from `upload`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [upload](/docs/upload).

A reactive upload queue. `createUploader({ transport })` validates files (size, type, image dimensions, magic-number sniffing, your own rule), uploads them with a concurrency limit, retries only failures a retry can fix (network, 408, 429 with Retry-After honoured, 5xx; never a 4xx), pauses, resumes, cancels and reports progress, speed and time left as signals that never go backwards and are written once per animation frame. `xhrTransport` sends with XMLHttpRequest because fetch has no upload progress; pass an `@pyreon/http` client and its base URL, headers and middleware apply. `useFilePicker` and `useFileDrop` are the state of a picker and a drop zone: enter and leave are counted across children, files are judged while dragging, folders are read, paste is an option, and picking the same file twice works. `@pyreon/upload/core` has the pure parts (validation, `sniffType`, chunk planning, progress math, the error taxonomy) with no dependencies. Dispose aborts in-flight requests and removes timers, listeners and object URLs; creating anything on the server is inert. Client validation is UX: the server must check type, size and content.

## Multiplatform

**Tier:** Web-only — the browser package; the native story is stated below

not lowered by PMTC: it is built on the browser File, Blob, XMLHttpRequest, DataTransfer and object URL APIs, which have no Swift or Kotlin counterpart in the compiler yet; native apps pick files with the platform pickers and upload with their own networking

See [Multiplatform](/docs/multiplatform) for the capability matrix and [Multiplatform libraries](/docs/multiplatform-libraries) for every package's tier.

## Features

- A reactive queue: concurrency limit, fair order, pause, resume, cancel, retry, aggregate progress, status and speed as signals
- Progress that never goes backwards (also across retries) and is written to signals once per animation frame, however often a transport reports
- Retry only what a retry can fix: network errors, timeouts, 408, 425, 429 (Retry-After in seconds or as a date) and 5xx; backoff with jitter; never a 4xx
- Validation: size ("10 MB"), accept (MIME, wildcards, extensions), image dimensions, magic-number sniffing, custom; plain-English messages with params for i18n
- XHR transport with real upload progress and an optional @pyreon/http client (base URL, auth headers, middleware)
- useFilePicker (same file twice works, cancel detected) and useFileDrop (counted enter/leave, folders, paste, judged while dragging)
- Dispose leaves nothing: aborts requests, clears timers and listeners, revokes object URLs; inert on the server

## Complete example

A full, end-to-end usage of the package:

```tsx
import { createUploader } from '@pyreon/upload'
import { xhrTransport } from '@pyreon/upload/transport-xhr'

const uploader = createUploader({ transport: xhrTransport({ url: '/api/upload' }), rules: { maxSize: '10 MB', accept: ['image/*'], maxFiles: 5 } })

typeof uploader.add   // => 'function'
uploader.status()   // => 'idle'
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`createUploader`](#createuploader-function-experimental) | function | A reactive upload queue. |
| [`useUploader`](#useuploader-function-experimental) | function | The same queue, for a component: disposed when the component unmounts. |
| [`xhrTransport`](#xhrtransport-function-experimental) | function | Upload each file as one request with XMLHttpRequest and report real upload progress. |
| [`xhrHttpTransport`](#xhrhttptransport-function-experimental) | function | The XHR transport as an `@pyreon/http` transport: it reports upload progress through `request.meta.onUploadProgress`. |
| [`useFilePicker`](#usefilepicker-function-experimental) | function | State for a file picker: `open()`, the picked `files()` and `inputProps` for a hidden input. |
| [`useFileDrop`](#usefiledrop-function-experimental) | function | State and handlers for a drop zone: `isOver()` (enter and leave are counted, so children do not make it flicker),… |
| [`validateFile`](#validatefile-function-experimental) | function | Check one file against `maxSize`, `minSize`, `accept`, and (asynchronously) `image` dimensions, `sniff` and `custom`. |
| [`validateFileAsync`](#validatefileasync-function-experimental) | function | `validateFile` as a Promise, whichever way it answers. |
| [`validateFiles`](#validatefiles-function-experimental) | function | Check a batch, one array of rejections per file, with `maxFiles` counted across the batch (and the `existing` files… |
| [`sniffType`](#snifftype-function-experimental) | function | The real type of a file by its first bytes, so `accept: image/*` is not fooled by a renamed .exe. |
| [`sniffBytes`](#sniffbytes-function-experimental) | function | `sniffType` on bytes you already have. |
| [`matchesAccept`](#matchesaccept-function-experimental) | function | Does a file match one of the `accept` patterns: MIME types, wildcards and extensions, ignoring case, as the `accept`… |
| [`parseSize`](#parsesize-function-experimental) | function | A size in bytes from a number or text: `"10 MB"` is 10,000,000 (KB, MB, GB, TB are decimal), `"10 MiB"` is 10,485,760… |
| [`formatSize`](#formatsize-function-experimental) | function | A size for a message, in decimal units: `1.5 MB`. |
| [`chunkCount`](#chunkcount-function-experimental) | function | How many parts a file has (an empty file has one empty part). |
| [`chunkRange`](#chunkrange-function-experimental) | function | The byte range of one part; slice the file with `Blob.slice(start, end)`. |
| [`planChunks`](#planchunks-function-experimental) | function | The parts of a file, lazily: a 1 TB file in 5 MB parts is 200,000 parts and is never held as an array. |
| [`suggestChunkSize`](#suggestchunksize-function-experimental) | function | A part size that keeps a file within `maxParts` parts (default 10,000, S3's limit) and not below `minSize` (default 5… |
| [`progressOf`](#progressof-function-experimental) | function | Bytes as a `Progress`, clamped; the ratio of an empty file is 0 until `complete`. |
| [`sumProgress`](#sumprogress-function-experimental) | function | The progress of several files, by bytes: a big file weighs more. |
| [`monotonic`](#monotonic-function-experimental) | function | The larger of what was shown and what is reported: progress never goes back. |
| [`remainingMs`](#remainingms-function-experimental) | function | Time left in ms from a speed in bytes per second; `null` while the speed is unknown. |
| [`createSpeedMeter`](#createspeedmeter-function-experimental) | function | A smoothed speed (exponential moving average): `record(loaded, now)`, `speed()` (null until two samples 250 ms apart),… |
| [`uploadError`](#uploaderror-function-experimental) | function | Build an `UploadError`. |
| [`isUploadError`](#isuploaderror-function-experimental) | function | Whether a value has the shape of an `UploadError`. |
| [`isRetryableStatus`](#isretryablestatus-function-experimental) | function | Is this HTTP status worth another attempt? 408, 425, 429 and 5xx are; other 4xx (validation, auth, size) never are. |
| [`parseRetryAfter`](#parseretryafter-function-experimental) | function | `Retry-After` as milliseconds: whole seconds or an HTTP date; a date in the past is 0; anything else is `undefined`. |
| [`errorFromStatus`](#errorfromstatus-function-experimental) | function | The error for a failed HTTP response: retryable by `isRetryableStatus`, with `retryAfter` and the parsed `body`. |
| [`toUploadError`](#touploaderror-function-experimental) | function | Any thrown value as an `UploadError`: an `AbortError` is `aborted`; an object with an HTTP `status` is a server error;… |
| [`defaultBackoff`](#defaultbackoff-function-experimental) | function | The delay before the next try: 500 ms doubling to a minute, with jitter between half and all of it. |
| [`collectDropped`](#collectdropped-function-experimental) | function | The files of a drop, with folders read and flattened when the browser supports `webkitGetAsEntry`. |
| [`collectPasted`](#collectpasted-function-experimental) | function | The files on the clipboard (a pasted image); text is not touched. |
| [`UploadFile`](#uploadfile-type-experimental) | type | One item of a queue: plain data and functions that read signals. |
| [`Uploader`](#uploader-type-experimental) | type | The queue returned by `createUploader`. |
| [`Transport`](#transport-type-experimental) | type | Sends one file. |
| [`FileRule`](#filerule-type-experimental) | type | What a file is checked against. |
| [`UploadError`](#uploaderror-type-experimental) | type | Why an upload did not work, and whether a retry can help. |

## API

### `createUploader` `function` — **experimental**

```ts
(options: UploaderOptions) => Uploader
```

A reactive upload queue. Files are validated, then sent by the transport with `concurrency` at a time (default 3, a whole number from 1). Failures that a retry can fix are retried up to `retry.attempts` tries in total (default 3) after a delay with jitter (a `Retry-After` is honoured); 4xx answers and unknown errors are never retried. Progress is written to signals once per animation frame and never decreases. Rejected files stay in the list with their reasons unless `keepRejected: false`. Created in a component or effect scope it is disposed with it; otherwise call `dispose()`. Creating one touches no browser API.

**Example**

```tsx
typeof createUploader({ transport: { upload: async () => 'ok' } }).add   // => 'function'
createUploader({ transport: { upload: async () => 'ok' } }).status()   // => 'idle'
```

**Common mistakes**

- Reading a whole file with `FileReader` to upload it: it holds the file in memory and has no upload progress. Pass the `File` to a transport, which slices it
- Never revoking preview object URLs: `preview: true` revokes them on remove, clear and dispose
- Trusting `file.type` or the extension: it is what the user's machine said. Use `rules.sniff` for the UI and check the content on the server
- Using `fetch` for a large upload and wishing for a progress bar: `fetch` has no upload progress. Use `xhrTransport`

**See also:** `xhrTransport` · `validateFile` · `useFileDrop`

---

### `useUploader` `function` — **experimental**

```ts
(options: UploaderOptions) => Uploader
```

The same queue, for a component: disposed when the component unmounts.

**Example**

```tsx
typeof useUploader({ transport: { upload: async () => 'ok' } }).files   // => 'function'
```

---

### `xhrTransport` `function` — **experimental**

```ts
(options: { url, method?, field?, headers?, withCredentials?, body?, timeout?, sendMeta?, client? }) => Transport
```

Upload each file as one request with XMLHttpRequest and report real upload progress. The file goes in a multipart field (default `file`) with the file meta as text fields, unless you build the body. A 2xx answer resolves with the parsed body (JSON when the server says so); 408, 425, 429 and 5xx are retryable (`Retry-After` honoured), other statuses are not; network failures and timeouts are retryable. With `client`, the request goes through an `@pyreon/http` client so its base URL, headers and middleware apply.

**Example**

```tsx
typeof xhrTransport({ url: '/upload' }).upload   // => 'function'
```

---

### `xhrHttpTransport` `function` — **experimental**

```ts
() => (request) => Promise<response>
```

The XHR transport as an `@pyreon/http` transport: it reports upload progress through `request.meta.onUploadProgress`. `xhrTransport({ client })` uses it; use it directly to send your own requests with progress.

**Example**

```tsx
typeof xhrHttpTransport()   // => 'function'
```

---

### `useFilePicker` `function` — **experimental**

```ts
(options?: { multiple?, accept?, directory?, capture?, onPick?, onCancel? }) => FilePicker
```

State for a file picker: `open()`, the picked `files()` and `inputProps` for a hidden input. The input is emptied after each pick (after the files are copied out), so choosing the same file twice works; a cancelled dialog is reported. With no input rendered, `open()` makes a detached one. Nothing touches the DOM until `open()`.

**Example**

```tsx
typeof useFilePicker({ accept: ['image/*'] }).open   // => 'function'
useFilePicker({ multiple: true }).inputProps.multiple   // => true
```

---

### `useFileDrop` `function` — **experimental**

```ts
(options?: { accept?, multiple?, disabled?, directories?, paste?, onDrop?, onReject? }) => FileDrop
```

State and handlers for a drop zone: `isOver()` (enter and leave are counted, so children do not make it flicker), `isValid()` (the dragged types judged against `accept` while dragging) and `dropProps` to spread. Folders are read and flattened when the browser can; `paste: true` also takes pasted files. Accepted files go to `onDrop`, the others to `onReject`.

**Example**

```tsx
useFileDrop().isOver()   // => false
useFileDrop().isValid()   // => null
```

---

### `validateFile` `function` — **experimental**

```ts
(file: File | Blob, rules: FileRule) => FileRejection[] | Promise<FileRejection[]>
```

Check one file against `maxSize`, `minSize`, `accept`, and (asynchronously) `image` dimensions, `sniff` and `custom`. An empty array means accepted. Each rejection has a `code` (`too-large`, `too-small`, `type`, `dimensions`, `custom`), a plain English `message` and `params` for translation. The answer is synchronous unless a rule has to look inside the file.

**Example**

```tsx
validateFile(new File(['x'], 'a.png', { type: 'image/png' }), { maxSize: 10 })   // => []
validateFile(new File(['x'], 'a.png', { type: 'image/png' }), { accept: ['.pdf'] })[0].code   // => 'type'
```

---

### `validateFileAsync` `function` — **experimental**

```ts
(file, rules) => Promise<FileRejection[]>
```

`validateFile` as a Promise, whichever way it answers.

**Example**

```tsx
typeof validateFileAsync   // => 'function'
```

---

### `validateFiles` `function` — **experimental**

```ts
(files, rules, existing?) => Promise<FileRejection[][]>
```

Check a batch, one array of rejections per file, with `maxFiles` counted across the batch (and the `existing` files already accepted): files past the limit are `too-many`.

**Example**

```tsx
typeof validateFiles   // => 'function'
```

---

### `sniffType` `function` — **experimental**

```ts
(file: Blob) => Promise<string | null>
```

The real type of a file by its first bytes, so `accept: image/*` is not fooled by a renamed .exe. Reads 264 bytes with `Blob.slice`. Known: PNG, JPEG, GIF, WebP, BMP, ICO, TIFF, AVIF, HEIC, PDF, ZIP (also DOCX, XLSX), GZIP, 7z, RAR, MP4, WebM, MP3, OGG, WAV, FLAC, Windows executables, ELF and SVG. `null` means "cannot tell", not "safe". Never the only check: the server must check the content.

**Example**

```tsx
sniffBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))   // => 'image/png'
sniffBytes(new Uint8Array([0x4d, 0x5a, 0, 0]))   // => 'application/x-msdownload'
sniffBytes(new TextEncoder().encode('hello'))   // => null
```

**Common mistakes**

- Treating a sniffed type as proof of safety: a polyglot file can start with a PNG header and be something else

---

### `sniffBytes` `function` — **experimental**

```ts
(head: Uint8Array) => string | null
```

`sniffType` on bytes you already have.

**Example**

```tsx
sniffBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))   // => 'image/jpeg'
```

---

### `matchesAccept` `function` — **experimental**

```ts
(file: { name?, type }, accept: readonly string[]) => boolean
```

Does a file match one of the `accept` patterns: MIME types, wildcards and extensions, ignoring case, as the `accept` attribute does. An empty list accepts everything.

**Example**

```tsx
matchesAccept({ name: 'a.PNG', type: 'image/png' }, ['image/*'])   // => true
matchesAccept({ name: 'a.exe', type: '' }, ['.png', 'image/*'])   // => false
```

---

### `parseSize` `function` — **experimental**

```ts
(value: number | string) => number
```

A size in bytes from a number or text: `"10 MB"` is 10,000,000 (KB, MB, GB, TB are decimal), `"10 MiB"` is 10,485,760 (KiB, MiB, GiB, TiB are binary). Anything else throws.

**Example**

```tsx
parseSize('10 MB')   // => 10000000
parseSize('1.5 MiB')   // => 1572864
parseSize(512)   // => 512
```

---

### `formatSize` `function` — **experimental**

```ts
(bytes: number) => string
```

A size for a message, in decimal units: `1.5 MB`.

**Example**

```tsx
formatSize(1500)   // => '1.5 KB'
formatSize(10000000)   // => '10 MB'
```

---

### `chunkCount` `function` — **experimental**

```ts
(size: number, chunkSize: number) => number
```

How many parts a file has (an empty file has one empty part).

**Example**

```tsx
chunkCount(10, 4)   // => 3
chunkCount(0, 4)   // => 1
```

---

### `chunkRange` `function` — **experimental**

```ts
(size, chunkSize, index) => { index, start, end }
```

The byte range of one part; slice the file with `Blob.slice(start, end)`.

**Example**

```tsx
chunkRange(10, 4, 2)   // => { index: 2, start: 8, end: 10 }
```

---

### `planChunks` `function` — **experimental**

```ts
(size, chunkSize) => Generator<Chunk>
```

The parts of a file, lazily: a 1 TB file in 5 MB parts is 200,000 parts and is never held as an array. The file is never read.

**Example**

```tsx
[...planChunks(10, 4)].map((c) => [c.start, c.end])   // => [[0, 4], [4, 8], [8, 10]]
```

---

### `suggestChunkSize` `function` — **experimental**

```ts
(size, options?: { minSize?, maxParts? }) => number
```

A part size that keeps a file within `maxParts` parts (default 10,000, S3's limit) and not below `minSize` (default 5 MiB).

**Example**

```tsx
suggestChunkSize(10)   // => 5242880
```

---

### `progressOf` `function` — **experimental**

```ts
(loaded, total, complete?) => Progress
```

Bytes as a `Progress`, clamped; the ratio of an empty file is 0 until `complete`.

**Example**

```tsx
progressOf(50, 200)   // => { loaded: 50, total: 200, ratio: 0.25 }
```

---

### `sumProgress` `function` — **experimental**

```ts
(list: Progress[]) => Progress
```

The progress of several files, by bytes: a big file weighs more.

**Example**

```tsx
sumProgress([progressOf(50, 100), progressOf(0, 100)]).ratio   // => 0.25
```

---

### `monotonic` `function` — **experimental**

```ts
(shown, reported) => number
```

The larger of what was shown and what is reported: progress never goes back.

**Example**

```tsx
monotonic(70, 30)   // => 70
```

---

### `remainingMs` `function` — **experimental**

```ts
(loaded, total, speed) => number | null
```

Time left in ms from a speed in bytes per second; `null` while the speed is unknown.

**Example**

```tsx
remainingMs(1500, 3000, 750)   // => 2000
remainingMs(0, 10, null)   // => null
```

---

### `createSpeedMeter` `function` — **experimental**

```ts
(alpha?) => SpeedMeter
```

A smoothed speed (exponential moving average): `record(loaded, now)`, `speed()` (null until two samples 250 ms apart), `reset()`.

**Example**

```tsx
createSpeedMeter().speed()   // => null
```

---

### `uploadError` `function` — **experimental**

```ts
(kind, message, extra?) => UploadError
```

Build an `UploadError`. A transport rejects with these so the queue knows whether to retry: `network` and `timeout` default to retryable, the others not.

**Example**

```tsx
uploadError('network', 'down').retryable   // => true
uploadError('server', 'bad', { status: 422 }).retryable   // => false
```

---

### `isUploadError` `function` — **experimental**

```ts
(x: unknown) => x is UploadError
```

Whether a value has the shape of an `UploadError`.

**Example**

```tsx
isUploadError(uploadError('aborted', 'x'))   // => true
isUploadError(new Error('x'))   // => false
```

---

### `isRetryableStatus` `function` — **experimental**

```ts
(status: number) => boolean
```

Is this HTTP status worth another attempt? 408, 425, 429 and 5xx are; other 4xx (validation, auth, size) never are.

**Example**

```tsx
isRetryableStatus(503)   // => true
isRetryableStatus(422)   // => false
```

---

### `parseRetryAfter` `function` — **experimental**

```ts
(value, now?) => number | undefined
```

`Retry-After` as milliseconds: whole seconds or an HTTP date; a date in the past is 0; anything else is `undefined`.

**Example**

```tsx
parseRetryAfter('120')   // => 120000
parseRetryAfter('soon')   // => undefined
```

---

### `errorFromStatus` `function` — **experimental**

```ts
(status, options?: { retryAfter?, body? }) => UploadError
```

The error for a failed HTTP response: retryable by `isRetryableStatus`, with `retryAfter` and the parsed `body`.

**Example**

```tsx
errorFromStatus(429, { retryAfter: '3' }).retryAfter   // => 3000
errorFromStatus(422).retryable   // => false
```

---

### `toUploadError` `function` — **experimental**

```ts
(error: unknown) => UploadError
```

Any thrown value as an `UploadError`: an `AbortError` is `aborted`; an object with an HTTP `status` is a server error; an unknown error is not retried (a bug is not weather).

**Example**

```tsx
toUploadError(new Error('bug')).retryable   // => false
```

---

### `defaultBackoff` `function` — **experimental**

```ts
(attempt, random?) => number
```

The delay before the next try: 500 ms doubling to a minute, with jitter between half and all of it.

**Example**

```tsx
defaultBackoff(1, () => 1)   // => 500
```

---

### `collectDropped` `function` — **experimental**

```ts
(data: DataTransfer, options?) => Promise<File[]>
```

The files of a drop, with folders read and flattened when the browser supports `webkitGetAsEntry`. Call it from the drop handler: the items are only valid during the event.

**Example**

```tsx
typeof collectDropped   // => 'function'
```

---

### `collectPasted` `function` — **experimental**

```ts
(data: DataTransfer) => File[]
```

The files on the clipboard (a pasted image); text is not touched.

**Example**

```tsx
collectPasted(null)   // => []
```

---

### `UploadFile` `type` — **experimental**

```ts
interface UploadFile { id; file; name; size; type; meta; status(); progress(); speed(); remaining(); error(); result(); preview(); attempt(); rejections() }
```

One item of a queue: plain data and functions that read signals.

**Example**

```tsx
const f = null as unknown as UploadFile
```

---

### `Uploader` `type` — **experimental**

```ts
interface Uploader { files(); add(); remove(); clear(); start(); pause(); resume(); cancel(); retry(); progress(); status(); isUploading(); dispose() }
```

The queue returned by `createUploader`.

**Example**

```tsx
const u = null as unknown as Uploader
```

---

### `Transport` `type` — **experimental**

```ts
interface Transport { upload(file, ctx: { signal, onProgress, resumeState?, saveResumeState }): Promise<unknown> }
```

Sends one file. Resolve with what the server returned; reject with an `UploadError`.

**Example**

```tsx
const t: Transport = { upload: async () => 'ok' }
```

---

### `FileRule` `type` — **experimental**

```ts
interface FileRule { maxSize?; minSize?; accept?; maxFiles?; image?; sniff?; custom? }
```

What a file is checked against.

**Example**

```tsx
const rule: FileRule = { maxSize: '10 MB', accept: ['image/*'] }
```

---

### `UploadError` `type` — **experimental**

```ts
interface UploadError { kind: "rejected" | "network" | "server" | "aborted" | "timeout"; message; status?; retryable; retryAfter?; body?; cause? }
```

Why an upload did not work, and whether a retry can help.

**Example**

```tsx
const e: UploadError = { kind: 'network', message: 'down', retryable: true }
```

---

## Package-level notes

> **Client validation is UX:** Size, type and sniffing checks make the interface friendly; they do not protect the server, because a client can send anything. The server must check type, size and content itself, and must never trust the file name or the declared type.

> **Progress is monotonic:** Progress never decreases. After a retry the transport restarts from zero on the wire, but the number you see holds at its high-water mark until the new attempt passes it. A `cancel` followed by `retry` is a new upload and starts at zero.

> **Why XHR:** XMLHttpRequest reports upload progress in every browser. `fetch` has no upload progress event, and streaming request bodies need HTTP/2 and are not available everywhere, so `xhrTransport` is the reliable baseline.

> **Retry rules:** Retried: network errors, timeouts, 408, 425, 429 and 5xx, after a backoff with jitter (a `Retry-After` header, in seconds or as a date, is honoured when longer). Never retried: other 4xx, errors a transport marks non-retryable, unknown thrown errors and aborts. `attempts` counts tries in total, the first included.

> **Previews and object URLs:** `preview: true` creates an object URL for images and videos; it is revoked when the file is removed, on `clear()` and on `dispose()`. Creating your own with `URL.createObjectURL` is yours to revoke.

> **Offline:** While `navigator.onLine` is false the queue pauses uploads and resumes them when it is back (`pauseWhenOffline: false` turns this off). It listens to `online` and `offline` on `window` from the first `add()` and removes the listeners on `dispose()`.

> **Server and SSR:** Creating an uploader, a picker or a drop zone on the server touches no browser API and starts no timer. Files only exist in the browser; `xhrTransport` fails with a clear error if it is ever called where there is no XMLHttpRequest.

> **Folders and DataTransfer:** `uploader.add(dataTransfer)` takes the top-level files. To read dropped folders use `collectDropped` (what `useFileDrop` does) from the drop handler: the items are only valid while the event runs.
