---
---

Docs only — no `@pyreon/*` package change, no version bump.

- **Docs hero animations rebuilt to the brand handoff.** `PyreonHeroMark.vue`
  is now a faithful port of `design_handoff_pyreon_brand/hero-animations.html`
  — the handoff's *state machine, not JS animation* contract:
  `data-state="entering"` gates every variant on the root, the default
  (no `data-state`) is the static resting frame so SSR / JS-disabled /
  first hydration paint are byte-identical (zero hydration mismatch), the
  entrance fires once via `IntersectionObserver` (threshold .25,
  unobserve-after-first) + `requestAnimationFrame`, never loops, no
  replay-on-click. All eleven handoff variants ship (trace · pulse · wave ·
  particles · fuse · term · rings · orbit · split · spot · ecg); one is
  picked at random per visit (`?hero=<name>` overrides for QA). Replaces
  the prior home-grown reimplementation whose variants animated
  incorrectly / were partly broken.
- **Dark + light both correct.** The handoff's exact ember/paper/ink/cyan
  palette with its `[data-theme="light"]` attribute-rewrite overrides,
  rebased onto the docs' `<html data-theme="light">` root (already driven
  by `tokens.css` + the FOUC script in `config.ts`). Built-CSS verified:
  the scoped `[data-theme=light] .px-heromark stop[stop-color="#FF1F8C"]`
  selector resolves against the SSR-rendered `<stop>` nodes in both themes.
- **Reduced motion** ported verbatim — the universal
  `@media (prefers-reduced-motion: reduce)` block snaps every variant to
  its end-state with no animation. `noMotion` prop (footer static mark)
  preserved.
