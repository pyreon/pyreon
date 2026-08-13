---
'@pyreon/native-compiler': minor
---

Lower `@pyreon/storage`'s process-scoped backends; name why the other two cannot

`@pyreon/storage` exports five backends and only `useStorage` lowered. The
other four warned with the GENERIC line, which left an author unable to tell
whether their backend was merely unimplemented or genuinely impossible — two
very different pieces of news.

Two have an exact native analogue and now lower to plain state:

- **`useSessionStorage`** — on the web, sessionStorage survives a reload and
  dies with the tab. Native has neither a tab nor a reload: the PROCESS is the
  session, so in-memory state is the analogue rather than an approximation of
  one.
- **`useMemoryStorage`** — definitionally process-scoped on every platform.

Both emit a `signal` decl WITHOUT a storage key — the same IR `useStorage`
produces, minus the `@AppStorage` / `rememberSaveable` persistence that would
wrongly outlive the process. That negative is asserted, because persisting
them would be the opposite of what both hooks mean.

The remaining two have no native analogue at all and now say so by name:
`useCookie` (a native app has no cookie jar its own UI reads from) and
`useIndexedDB` — which points at `useDatabase()`, the hook that lowers to
SQLite on both targets and is the answer the author actually wants.
