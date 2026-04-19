---
'@pyreon/router': patch
'@pyreon/query': patch
'@pyreon/store': patch
'@pyreon/storage': patch
---

QA audit fixes (5 HIGH + 2 MEDIUM):

- **router**: `useBlocker` uses shared ref-counted `beforeunload` listener instead of per-blocker — prevents listener accumulation across multiple blockers
- **router**: `destroy()` clears `_activeRouter` global ref and releases remaining blocker listeners — prevents stale router surviving in SSR/re-creation
- **query/useSubscription**: close WebSocket BEFORE nulling handlers — prevents race where queued message fires null handler
- **query/useSubscription**: respect `intentionalClose` when reactive deps change — user's explicit `close()` no longer gets overridden by signal change
- **store**: plugin errors now logged with `__DEV__` console.warn instead of silently swallowed
- **storage/IndexedDB**: initialization errors (corrupted DB, quota exceeded) now call `onError` callback and log in dev mode instead of silently falling back to default
