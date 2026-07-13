---
"@pyreon/kinetic": patch
---

Fix style/preset staggers not staggering, and complete double-rAF cancellation.

- **Stagger delay was clobbered for the style/preset path.** Assigning the CSS
  `transition` shorthand (`el.style.transition = enterTransition`) resets every
  omitted longhand — including `transition-delay` → `0s` — in Chromium/Firefox,
  so `.preset(slideUp).stagger()` (and any style-based stagger) animated all
  children at once. kinetic now assigns the shorthand through `setTransition`,
  which preserves the delay from a stable `--kinetic-delay` custom property
  (survives both the shorthand reset and the `transition=''` reset at the
  `entered` stage, so multi-cycle staggers keep their delay). This was invisible
  to unit tests because happy-dom does not model the CSSOM shorthand→longhand
  reset — regression-locked in real Chromium.
- **`nextFrame` now returns a cancel handle that cancels both double-rAF frames**
  (a bare `cancelAnimationFrame(outerId)` missed the inner frame once the outer
  had fired, so a rapid enter→leave inside one frame could still commit the
  stale enter-to state) and no-ops when `cancelAnimationFrame` is undefined
  (post-teardown / SSR safe).
- Added `bench/` — a real-Chromium (Playwright) animation JS-overhead benchmark
  vs Motion One and a bare-CSS floor (`bun run bench`). Dev-only; not published.
