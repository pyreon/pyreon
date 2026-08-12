---
'@pyreon/hooks': patch
---

restore `@pyreon/hooks` to its coverage thresholds (source changes are comments only)

`Coverage (Full)` had been red on every push to main. `@pyreon/hooks` measured
98.95% statements / 96.29% branches against configured 99 / 98 — thresholds set
in #1611 and never lowered, so the coverage had drifted down as the
native-colocation hooks landed without matching tests.

The real gap was that `useFetch` had **no test file at all**, including for the
contract its own JSDoc documents: "each `refetch()` aborts the previous in-flight
request, so a slow stale response can never clobber a fresh one" — leak class F,
untested. Now covered, along with a server-initiated `useWebSocket` close (the
fake's `close()` never fired `onclose`, so a dropped connection was untested
while the fake looked faithful) and a `useDatabase` cold read in a
blocked-storage context.

One `v8 ignore` was factually wrong and is corrected: it claimed
"happy-dom has no checkVisibility" and sat on `useFocusTrap`'s
`checkVisibility` branch. happy-dom reports
`typeof el.checkVisibility === 'function'` (measured), so the ignore was
excluding covered code while the genuinely-unreachable fallback counted against
coverage. The ignore now sits on the fallback.

Remaining ignores are the `isServer` / `isClient` module-load env guards, whose
false side cannot be reached without mocking `@pyreon/reactivity` — the same
justification the package already used for `useDatabase`'s server arm.

No runtime behaviour changes: every source edit in this changeset is a comment.
