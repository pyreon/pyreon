---
---

Docs only — no `@pyreon/*` package change, no version bump.

- **Docs hero animation redo** (`docs/.vitepress/theme/components/PyreonHeroMark.vue`):
  replaced the home-grown reimplementation (different viewBox, fragile
  `v-if="playing && v===N"` toggle, no state machine — several intros were
  broken / didn't animate) with a **faithful verbatim port** of the brand
  handoff's production reference, `design_handoff_pyreon_brand/hero-animations.html`.
  All eleven handoff intros ship (trace · pulse · wave · particles · fuse ·
  term · rings · orbit · split · spot · ecg), one picked at random per visit.
  Honours the handoff production contract exactly: `data-state="entering"`
  state machine (not JS animation), SSR-safe static resting default,
  `requestAnimationFrame` + `IntersectionObserver` (threshold .25,
  unobserve-after-once) trigger, plays once / never loops, universal
  `prefers-reduced-motion` end-state snap. Dark default; the handoff's
  light-theme attribute-recolor block is re-anchored to the docs theme
  root (`[data-theme="light"]` on `<html>`) so it flips correctly.
  `noMotion` (footer static mark) preserved.
