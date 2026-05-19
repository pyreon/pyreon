---
'@pyreon/kinetic': minor
---

fix(kinetic): `kinetic(tag).<mode>` API emits children in SSR for initially-hidden state — completes the PR #717 SSR coverage

**Bug class continuation of #717.** PR #717 fixed the top-level `<Transition>` direct-import path, but the `kinetic(tag).<mode>` factory API — which the README promotes as the primary surface ("Four Modes" section) — has its own per-mode renderers that all carried the identical `<Show when={shouldMount} fallback={null}>` shape:

- `TransitionRenderer` → `kinetic('div').preset(fadeUp)` (default `.transition` mode)
- `TransitionItem` → `kinetic('ul').stagger()` per item (cascading-children mode) AND `kinetic('ul').group()` per item
- `CollapseRenderer` → `kinetic('div').collapse()` (height-animation mode)

Every consumer of these — including the documented cascading-Stagger pattern surfaced by a real resume-page report — still hit the SSR-children-dropped bug after #717 landed. The reporter's scroll-reveal `<Reveal>` helper (`useIntersection` + sticky-signal + `kinetic` mode) stayed blocked because the SSR fix didn't reach the renderers backing the kinetic-mode factory.

**Fix.** Same `wasInitiallyShown` branch pattern from #717, applied to each of the three renderers:

- Initially-visible → existing `<Show>`-gated mount unchanged (preserves runtime-unmount semantic for visible→hidden).
- Initially-hidden → always renders children with hidden-state class/style inlined. Picker: `leaveTo` / `leaveToStyle` (explicit hidden-end state) wins; falls back to `enterFrom` / `enterStyle` (pre-enter state).

**Critical refinement vs PR #717: the `enterStyle` fallback for the preset path.** Reading `@pyreon/kinetic-presets`' factories revealed every preset (fadeUp, blurInUp, slideLeft, …) populates `enterStyle` as the hidden state — but may not set `leaveToStyle`. Without the `enterStyle` fallback, preset users would SSR-render VISIBLE → flash-on-hydration. This PR's hidden-style picker is `leaveToStyle ?? enterStyle` (PR #717's Transition.tsx uses `leaveToStyle` alone and has the same gap; small follow-up commit needed on that branch OR a tiny follow-up PR after merge).

**Companion fix: `applyEnter` symmetric to `applyLeave`.** Each renderer's `applyEnter` now clears residual `leave` / `leaveFrom` / `leaveTo` classes at start, so the SSR-baked hidden-state class (or one persisting after a leave-complete with `unmount: false`) doesn't compete with `enterTo`'s CSS rules during the enter cycle.

**CollapseRenderer specifics.** Different shape from the other two: the outer wrapper always rendered (with `height: 0; overflow: hidden`), but the INNER `<div ref={contentRef}>{children}</div>` was Show-gated and produced an empty wrapper at SSR. Fix keeps the outer wrapper's visual hiding (height: 0 IS the layout-safe collapse — flex slots see a 0-height box, no slot-collapse) while always rendering inner content. Trade-off: initially-hidden Collapses no longer unmount the inner subtree after a later close. Initially-visible Collapses keep the unmount behavior.

**Trade-off (consistent across all three renderers).** For initially-hidden kinetic-mode components, `unmount: true` no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. Initially-visible components keep the unmount semantic. Matches Framer Motion / react-transition-group conventions; the price of SSR correctness.

**Coverage added.**

- `kinetic-modes.ssr.test.tsx` — 9 SSR specs against real `renderToString` covering all three renderers with both initially-hidden + initially-visible cases per mode, plus the preset-path `enterStyle` fallback assertion.
- `kinetic.browser.test.tsx` — 4 new real-Chromium specs: kinetic('section').transition initial-hidden mount + show-flip enter, kinetic('ul').stagger() all-items-mounted, kinetic('div').collapse() inner-content-present-with-height:0.
- `Collapse.test.tsx` helper updated (`wireContentRef`) to walk both vnode shapes (direct div for the SSR-correct initially-hidden branch + Show-wrapped div for the unchanged initially-visible branch) — pure test-plumbing change, behavioral assertions unchanged.

**Bisect-verified.** Reverting all three `wasInitiallyShown` branches simultaneously fails 6 of the 9 SSR specs across all three describe blocks (`expected '' to contain '<h2'`, `'<ul></ul>' to contain 'Heading'`, `'<div style="overflow: hidden; height:…' to contain 'accordion panel content for SEO'`) — proves each renderer fix is individually load-bearing. The 3 initially-visible no-regression specs keep passing in both states. Restored → 12 files / 206 vitest + 12 browser specs green.

**Why this shipped undetected (root analysis).** Zero kinetic tests touched the runtime-server path; the README's documented patterns were never SSR-exercised end-to-end. PR #717 added that test layer for `<Transition>` only; this PR closes the gap across the rest of the public API.

**Docs deliberately not touched in this PR** to avoid conflicts with #717's CLAUDE.md / README / anti-patterns.md edits. Once both merge, the CLAUDE.md kinetic-section bullet from #717 can be lightly extended to call out "applied to all four kinetic primitives — direct `<Transition>` + `kinetic(tag)` transition/stagger/group/collapse modes" as a follow-up.
