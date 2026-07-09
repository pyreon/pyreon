---
"@pyreon/elements": patch
---

fix(elements): `Text` `label` (and an explicit `children` prop) are now reactive

`<Text label={someSignal()} />` previously rendered the signal's value once and never updated. `Text` read `own.children ?? own.label` **eagerly** at setup, so a compiler `_rp()`-getter (what `label={sig()}` lowers to) was captured a single time. It now passes `children` as an accessor (`() => own.children ?? own.label`) — mirroring `Element`'s `getChildren` — so `mountChild` mounts it reactively and re-reads on each change.

PR #1168 closed the sibling _rest-prop_ boundary (href/title/etc.) but left this children read eager; this closes the residual gap. `<Text>{sig()}</Text>` (a JSX-child accessor) was already reactive — the bug was specific to the getter-valued `label`/`children` **prop**. Bisect-verified with real-Chromium specs (revert the accessor → `expected 'live-1' to be 'live-2'`).
