---
'@pyreon/hooks': minor
---

`useDatabase` had no web half — and the kitchen-sink example imported it from a package that never exported it.

PMTC lowers `useDatabase()` to `PyreonDatabase` on both native targets and it is
device-proven (file-backed, survives relaunch). There was no web
implementation, no export, and no type anywhere in `packages/`.

That is not hypothetical. `examples/native-counter-ios/src/Counter.tsx` — 19
passing XCUITests — imported `useDatabase` from `@pyreon/primitives`, which does
not export it. PMTC matches hook NAMES and never resolves imports, and that
example is one of four with **no typechecked web sibling**, so nothing caught
it. The flagship device-proven example was source no TypeScript build would
accept. The import now points at `@pyreon/hooks`, where the implementation
lives; the emit is byte-identical before and after on both targets, so the 19
device tests provably cannot regress from the change.

The API is SYNCHRONOUS because the native one is (`get` returns
`PyreonRecord?`, not a promise). That rules out IndexedDB: its async API would
force `await` into source compiling for three targets — the same shared-code
break that made `@pyreon/form` non-shared. `localStorage` is the faithful
analogue: synchronous, persistent across reloads, same read-modify-write
semantics.

A real bug surfaced during testing and is worth recording, because it is a
storage failure a user would experience as data resurrection: the in-memory
mirror (which exists so records still round-trip when persistence is blocked)
was also consulted on a `localStorage` MISS. So after a user cleared site data,
deleted records came back for the rest of the session. A miss is authoritative;
the mirror is now used only when storage is genuinely unavailable.

HONEST LIMITS, stated because a storage layer that quietly stops persisting is
worse than one that never claimed to: ~5 MB per origin; values are strings on
every target (the native `fields` is `[String: String]`), so callers serialise
numbers and dates themselves; `find` is a linear scan, as it is natively.
