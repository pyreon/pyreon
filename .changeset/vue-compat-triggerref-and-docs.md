---
'@pyreon/vue-compat': patch
---

Fix `triggerRef` to notify subscribers exactly once with the unchanged
value (matching Vue), and correct documentation.

- `triggerRef` previously forced a notification by bouncing the signal
  through `undefined` (`set(undefined); set(current)`) to defeat the
  Object.is dedup. Outside a batch, that fired subscribers TWICE and
  exposed the transient `undefined` to anything reading the ref during
  the notification. The two writes are now wrapped in `batch()`, so
  subscribers coalesce to a single fire on the restored value and never
  observe the sentinel.
- Docs: writable `computed({ get, set })` was documented as "not
  supported / throws on write" but has been implemented + tested all
  along (only the getter-only form is readonly). Corrected the Key
  Differences table, the computed section, and the migration guide.
- `markRaw`: documented the known top-level-only limitation (nested
  `markRaw` is still deep-proxied because the underlying `createStore`
  recurses without knowledge of vue-compat's `V_SKIP` marker).
