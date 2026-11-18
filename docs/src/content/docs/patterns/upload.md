---
title: "File uploads"
summary: "Validate with rules, upload with a transport that reports real progress, read the state as signals, and let the queue retry and clean up. Never read a whole file into memory or trust file.type."
seeAlso: [event-listeners]
---

## The pattern

Add files to a queue; it validates them, uploads them with a concurrency limit and exposes status, progress and errors as signals. A transport does the sending, so the same queue works with a single request today and a resumable protocol later. Picking and dropping are separate small pieces of state that hand `File`s to `uploader.add`.

```ts
import { createUploader, useFileDrop, useFilePicker } from '@pyreon/upload'
import { xhrTransport } from '@pyreon/upload/transport-xhr'

const uploader = createUploader({ transport: xhrTransport({ url: '/api/upload' }), rules: { maxSize: '10 MB', accept: ['image/*'] } })
const picker = useFilePicker({ accept: ['image/*'], onPick: (files) => uploader.add(files) })
const drop = useFileDrop({ accept: ['image/*'], onDrop: (files) => uploader.add(files) })

// In JSX: {() => uploader.files().map((f) => <li>{f.name} {() => f.progress().ratio}</li>)}
```

## Why

`fetch` cannot report upload progress and a `FileReader` copy of a big file sits in memory; the transport sends the `File` straight from disk with `XMLHttpRequest` progress events. The queue retries only failures a retry can fix (network errors, 408, 429, 5xx, never a 4xx validation error), keeps progress from going backwards, writes signals once per frame, and on `dispose()` aborts requests and revokes object URLs, so nothing leaks.

## Anti-pattern

```ts
// BROKEN: reads the whole file, trusts file.type, has no progress, never revokes the URL
const reader = new FileReader()
reader.onload = async () => {
  if (file.type !== 'image/png') return // the sender's machine said so
  await fetch('/upload', { method: 'POST', body: reader.result }) // no progress, the whole file in memory
}
reader.readAsArrayBuffer(file)
img.src = URL.createObjectURL(file) // never revoked

// Correct
const uploader = createUploader({ transport: xhrTransport({ url: '/upload' }), rules: { accept: ['image/png'], sniff: true }, preview: true })
uploader.add([file]) // validated with reasons, sent from disk with progress, preview URL revoked on remove or dispose
```

Also: showing a file name with `innerHTML` (names are untrusted: render them as text), counting `dragenter` and `dragleave` by hand (they fire on every child element: use `useFileDrop`), and treating client validation as security (the server must check type, size and content itself).

## Related

- `@pyreon/upload` for the functions, and its docs page for the queue, retry rules, the `@pyreon/http` seam and the security notes.
- `@pyreon/http` for the client whose base URL, headers and middleware an upload can reuse.
