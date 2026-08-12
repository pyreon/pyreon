---
"@pyreon/kinetic": patch
---

fix(kinetic): `reverseLeave` now actually reverses the leave order (was a no-op in the common mount-visible case)

`<Stagger reverseLeave>` / `kinetic(...).stagger({ reverseLeave: true })` gated the reversal on `!show()` **evaluated once at mount**. Stagger components run once, so a stagger mounted visible (`show` true — the dominant usage: items appear, then later leave) took the `else` branch and produced a **forward** leave order identical to `reverseLeave: false` — the feature silently did nothing. In the only case the branch fired (`show` false at mount) it reversed the *enter* order instead, backwards from the prop name.

The per-item delay is now phase-aware: a forward `--kinetic-delay` (enter) and a mirrored `--kinetic-leave-delay` (leave, when `reverseLeave`), with `setTransition(el, value, 'leave')` applying the reversed delay on the leave phase. Enter stays forward; the last-entered item leaves first. Non-`reverseLeave` staggers set both vars equal, so their behaviour is byte-identical. `onAfterLeave` (already attached to the item that leaves last) now fires correctly because that item genuinely has the largest leave delay.

The prior mock-vnode tests encoded the bug (one asserted the common case does nothing); they're rewritten to the corrected invariant, plus a `setTransition` phase-picking test.

Bisect-verified; full `@pyreon/kinetic` suite (274) green.
