---
"@pyreon/storage": minor
---

`useStorage` / `useSessionStorage` accept an opt-in `writeDebounceMs` option that coalesces the persistence write. `localStorage.setItem` is synchronous main-thread I/O, so a value persisted on every keystroke (a draft) pays a `JSON.stringify` + `setItem` per character; `writeDebounceMs` debounces only the WRITE — the signal still updates synchronously (the UI stays reactive), the latest value wins, and a pending write is flushed on `pagehide`/`beforeunload` (via one shared idempotent listener) so the last value is never lost on tab close. `.remove()` cancels any pending write. Default (omit or `0`) keeps the synchronous write — byte-identical to prior behavior. No effect on cookie / IndexedDB (already debounced) / memory backends.
