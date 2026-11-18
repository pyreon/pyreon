---
"@pyreon/upload": minor
---

New package `@pyreon/upload` (Experimental), first release: file selection, validation, preview and upload with progress as signals.

- **Core (`@pyreon/upload/core`, no dependencies):** `validateFile` / `validateFiles` (size as bytes or `"10 MB"`, `accept` like the HTML attribute, image dimensions, `sniffType` magic numbers, your own rule; rejections have a `code`, a message and `params` for i18n), chunk planning (`planChunks`, never reads the file), progress math, and an error taxonomy that says what is retryable (`errorFromStatus`, `parseRetryAfter`).
- **Queue (`createUploader` / `useUploader`):** concurrency limit and fair order, pause, resume, cancel, retry with jittered back-off for failures a retry can fix (never a 4xx; `Retry-After` honoured), offline pause, previews as object URLs that are revoked, progress that never goes backwards and is written once per animation frame, and a `dispose` that leaves no request, timer, listener or object URL.
- **`@pyreon/upload/transport-xhr`:** `xhrTransport` sends with XMLHttpRequest (real upload progress), optionally through an `@pyreon/http` client so its base URL, headers and middleware apply.
- **State for the DOM:** `useFilePicker` (same file twice works, cancel detected) and `useFileDrop` (counted enter and leave, folders, paste, judged while dragging).
