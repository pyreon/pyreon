---
'@pyreon/storage': patch
---

Same-key consumers are refcounted on EVERY backend, not just localStorage

`useStorage` was taught (#725/#729) that same-key consumers share one signal and
one registry entry, so that a single consumer's `.remove()` does not destroy the
entry its siblings still hold. The registry's own docstring states the contract —
"per-consumer `.remove()` goes through `releaseEntry`" — and four of the five
backends kept the pre-fix shape:

- `useSessionStorage` never RETAINED yet always RELEASED (it shares
  `createStorageSignal` with localStorage), so the count went 1 → 0 on whichever
  consumer removed first;
- `useCookie`, `useIndexedDB` and `createStorage(...)` called `removeEntry`
  directly, bypassing the refcount entirely.

The consequence was the same in each: the first `.remove()` orphaned every
sibling. `removeStorage`/`clearStorage` stopped seeing their signal, and the next
call for that key minted a SECOND, independent one — so two live consumers of one
storage key silently stopped agreeing.

`.remove()` still clears the stored value and resets the shared signal every
time; only the registry entry is refcounted, matching what `createStorageSignal`
already did for local and session.
