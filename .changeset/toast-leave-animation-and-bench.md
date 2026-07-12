---
"@pyreon/toast": minor
---

Animated leave + hard `toast.remove()`, and a fair three-way competitor benchmark.

**Leave animation (fixes dead code + a doc over-claim).** `toast.dismiss(id?)` is now
SOFT: it flips the toast to `state: 'exiting'`, plays the CSS leave transition
(fade + collapse in place while siblings reflow smoothly), then hard-removes it
after `LEAVE_DURATION` (200ms). Auto-dismiss and manual dismiss both animate out.
`onDismiss` still fires immediately. Previously the `'exiting'` state was typed,
styled, and read by the render layer but NOTHING ever set it — dismissal was
instant and the documented exit animation never played. The store owns the leave
timing (works headless); the fine-grained `<For by=id>` + `_toastMap` render path
is unchanged (its `class` binding already reacts to `state==='exiting'`).

**New `toast.remove(id?)`** — the HARD, instant, animation-free removal path (the
exact `dismiss` (soft) / `remove` (hard) split react-hot-toast ships). Use it when
you need a toast gone right now.

**Behavior note (pre-1.0):** `toast.dismiss(id)` no longer removes from the store
synchronously — the toast lingers as `exiting` for ~200ms while it animates. Code
that read `_toasts()` immediately after `dismiss` should use `toast.remove(id)`
(instant) or account for the leave delay.

**Docs fixes:** README/docs/manifest/CLAUDE.md no longer claim `aria-live="polite"`
(the a11y is type-aware `role="alert"`/`role="status"`), the phantom
`ToastOptions.position` field is removed, and swipe-to-dismiss / collapsed-stacking
/ per-toast-position are documented as deliberate non-goals.

**Benchmark:** a new `bench/toast-commit-bench.ts` adds react-hot-toast + sonner —
a fresh-process create-throughput row (all three, fair) and mounted-Toaster
create/update/dismiss→DOM-commit rows (@pyreon/toast vs react-hot-toast, where
Pyreon's fine-grained patch beats React re-render ~20×). The headless
`toast-bench.ts` now measures the hard `remove` path symmetrically.
