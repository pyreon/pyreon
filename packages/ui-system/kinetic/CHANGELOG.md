# @pyreon/kinetic

## 0.22.0

### Minor Changes

- [#719](https://github.com/pyreon/pyreon/pull/719) [`50afe21`](https://github.com/pyreon/pyreon/commit/50afe21856cf348eba8d096e1be0eedd6879850b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `kinetic(tag).<mode>` API emits children in SSR for initially-hidden state — completes the PR [#717](https://github.com/pyreon/pyreon/issues/717) SSR coverage

  **Bug class continuation of [#717](https://github.com/pyreon/pyreon/issues/717).** PR [#717](https://github.com/pyreon/pyreon/issues/717) fixed the top-level `<Transition>` direct-import path, but the `kinetic(tag).<mode>` factory API — which the README promotes as the primary surface ("Four Modes" section) — has its own per-mode renderers that all carried the identical `<Show when={shouldMount} fallback={null}>` shape:

  - `TransitionRenderer` → `kinetic('div').preset(fadeUp)` (default `.transition` mode)
  - `TransitionItem` → `kinetic('ul').stagger()` per item (cascading-children mode) AND `kinetic('ul').group()` per item
  - `CollapseRenderer` → `kinetic('div').collapse()` (height-animation mode)

  Every consumer of these — including the documented cascading-Stagger pattern surfaced by a real resume-page report — still hit the SSR-children-dropped bug after [#717](https://github.com/pyreon/pyreon/issues/717) landed. The reporter's scroll-reveal `<Reveal>` helper (`useIntersection` + sticky-signal + `kinetic` mode) stayed blocked because the SSR fix didn't reach the renderers backing the kinetic-mode factory.

  **Fix.** Same `wasInitiallyShown` branch pattern from [#717](https://github.com/pyreon/pyreon/issues/717), applied to each of the three renderers:

  - Initially-visible → existing `<Show>`-gated mount unchanged (preserves runtime-unmount semantic for visible→hidden).
  - Initially-hidden → always renders children with hidden-state class/style inlined. Picker: `leaveTo` / `leaveToStyle` (explicit hidden-end state) wins; falls back to `enterFrom` / `enterStyle` (pre-enter state).

  **Critical refinement vs PR [#717](https://github.com/pyreon/pyreon/issues/717): the `enterStyle` fallback for the preset path.** Reading `@pyreon/kinetic-presets`' factories revealed every preset (fadeUp, blurInUp, slideLeft, …) populates `enterStyle` as the hidden state — but may not set `leaveToStyle`. Without the `enterStyle` fallback, preset users would SSR-render VISIBLE → flash-on-hydration. This PR's hidden-style picker is `leaveToStyle ?? enterStyle` (PR [#717](https://github.com/pyreon/pyreon/issues/717)'s Transition.tsx uses `leaveToStyle` alone and has the same gap; small follow-up commit needed on that branch OR a tiny follow-up PR after merge).

  **Companion fix: `applyEnter` symmetric to `applyLeave`.** Each renderer's `applyEnter` now clears residual `leave` / `leaveFrom` / `leaveTo` classes at start, so the SSR-baked hidden-state class (or one persisting after a leave-complete with `unmount: false`) doesn't compete with `enterTo`'s CSS rules during the enter cycle.

  **CollapseRenderer specifics.** Different shape from the other two: the outer wrapper always rendered (with `height: 0; overflow: hidden`), but the INNER `<div ref={contentRef}>{children}</div>` was Show-gated and produced an empty wrapper at SSR. Fix keeps the outer wrapper's visual hiding (height: 0 IS the layout-safe collapse — flex slots see a 0-height box, no slot-collapse) while always rendering inner content. Trade-off: initially-hidden Collapses no longer unmount the inner subtree after a later close. Initially-visible Collapses keep the unmount behavior.

  **Trade-off (consistent across all three renderers).** For initially-hidden kinetic-mode components, `unmount: true` no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. Initially-visible components keep the unmount semantic. Matches Framer Motion / react-transition-group conventions; the price of SSR correctness.

  **Coverage added.**

  - `kinetic-modes.ssr.test.tsx` — 9 SSR specs against real `renderToString` covering all three renderers with both initially-hidden + initially-visible cases per mode, plus the preset-path `enterStyle` fallback assertion.
  - `kinetic.browser.test.tsx` — 4 new real-Chromium specs: kinetic('section').transition initial-hidden mount + show-flip enter, kinetic('ul').stagger() all-items-mounted, kinetic('div').collapse() inner-content-present-with-height:0.
  - `Collapse.test.tsx` helper updated (`wireContentRef`) to walk both vnode shapes (direct div for the SSR-correct initially-hidden branch + Show-wrapped div for the unchanged initially-visible branch) — pure test-plumbing change, behavioral assertions unchanged.

  **Bisect-verified.** Reverting all three `wasInitiallyShown` branches simultaneously fails 6 of the 9 SSR specs across all three describe blocks (`expected '' to contain '<h2'`, `'<ul></ul>' to contain 'Heading'`, `'<div style="overflow: hidden; height:…' to contain 'accordion panel content for SEO'`) — proves each renderer fix is individually load-bearing. The 3 initially-visible no-regression specs keep passing in both states. Restored → 12 files / 206 vitest + 12 browser specs green.

  **Why this shipped undetected (root analysis).** Zero kinetic tests touched the runtime-server path; the README's documented patterns were never SSR-exercised end-to-end. PR [#717](https://github.com/pyreon/pyreon/issues/717) added that test layer for `<Transition>` only; this PR closes the gap across the rest of the public API.

  **Docs deliberately not touched in this PR** to avoid conflicts with [#717](https://github.com/pyreon/pyreon/issues/717)'s CLAUDE.md / README / anti-patterns.md edits. Once both merge, the CLAUDE.md kinetic-section bullet from [#717](https://github.com/pyreon/pyreon/issues/717) can be lightly extended to call out "applied to all four kinetic primitives — direct `<Transition>` + `kinetic(tag)` transition/stagger/group/collapse modes" as a follow-up.

### Patch Changes

- [#721](https://github.com/pyreon/pyreon/pull/721) [`7cef86b`](https://github.com/pyreon/pyreon/commit/7cef86b68100034b70e47376ef26f22e3079f66f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `<Transition>`'s SSR hidden-style picker falls back to `enterStyle` for the preset path

  **Gap completion for PR [#717](https://github.com/pyreon/pyreon/issues/717).** When PR [#717](https://github.com/pyreon/pyreon/issues/717) shipped the `wasInitiallyShown` branch on `Transition.tsx`, the hidden-style picker was `props.leaveToStyle` alone. Reading `@pyreon/kinetic-presets`' factories during PR [#719](https://github.com/pyreon/pyreon/issues/719) revealed every shipped preset (`fadeUp`, `blurInUp`, `slideLeft`, `fadeScale`, …) populates **`enterStyle` as the hidden state** but may not set `leaveToStyle` directly. Consequence for the direct-`<Transition>` import path on the preset shape:

  ```tsx
  <Transition
    show={() => false}
    enter="transition-all duration-300"
    enterStyle={{ opacity: 0, transform: "translateY(16px)" }} // ← preset hidden state
    enterToStyle={{ opacity: 1, transform: "translateY(0)" }}
  >
    ...
  </Transition>
  ```

  Pre-fix: `hiddenStyle = props.leaveToStyle` is `undefined` → SSR renders the element with **no inline hidden style** → the element appears VISIBLE in the prerendered HTML → flash-on-hydration (visible → JS applies enterStyle → opacity:0 → enter animation → visible).

  PR [#719](https://github.com/pyreon/pyreon/issues/719) already fixed this for the `kinetic(tag).<mode>` factory paths (TransitionRenderer / TransitionItem / CollapseRenderer). This commit aligns the direct `<Transition>` import path to match.

  **The fix.** One-line picker change in `Transition.tsx`:

  ```diff
  -  const hiddenStyle = props.leaveToStyle
  +  const hiddenStyle = props.leaveToStyle ?? props.enterStyle
  ```

  Mirrors the existing `hiddenClass = props.leaveTo ?? props.enterFrom` class picker — both halves now follow the same "prefer leave-end state, fall back to pre-enter state" convention.

  **Coverage.** New SSR spec `falls back to enterStyle as hidden style when leaveToStyle undefined (preset path)` added to `Transition.ssr.test.tsx`. **Bisect-verified**: reverting the `?? props.enterStyle` fallback fails ONLY this spec with `expected '<section>preset-shaped hidden state</…' to contain 'opacity: 0'` (element renders but with no hidden style — exact flash-on-hydration bug shape); the 7 existing [#717](https://github.com/pyreon/pyreon/issues/717) specs keep passing. Restored → 8/8 passing (full kinetic suite: 13 files / 214 tests + 14 browser specs + typecheck clean).

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/runtime-dom@0.22.0

## 0.21.0

### Minor Changes

- [#717](https://github.com/pyreon/pyreon/pull/717) [`89785b4`](https://github.com/pyreon/pyreon/commit/89785b4e8c1ac72e2a1ac2ea01e399b849bcf86e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `<Transition show={() => false}>` now emits children in SSR (was: dropped from prerendered HTML)

  **Bug.** `<Transition>` rendered `<Show when={shouldMount} fallback={null}>`; with the documented `unmount: true` default, an initially-hidden Transition (`show: () => false`) rendered `null` on the server. Any SSG site using kinetic for scroll-triggered reveal — the documented `useIntersection` + sticky-signal pattern, where `show` is false at SSR because IntersectionObserver can't fire until client hydration — shipped with the wrapped content **structurally absent** from the prerendered HTML. Bad for SEO, social scrapers, accessibility tools, and no-JS users.

  **Why it shipped undetected.** Zero existing tests exercised `show: () => false` initial state, and zero kinetic tests touched the runtime-server path. Both layers needed — real `renderToString` + a hidden initial state — to surface the bug.

  **Fix.** `Transition` now branches at setup on `props.show()`:

  - **Initially-visible** Transitions keep the original `<Show>`-gated mount unchanged, preserving the runtime-unmount semantic for the visible→hidden transition (modals closing, dropdowns collapsing, etc.).
  - **Initially-hidden** Transitions always render children with the hidden-state class/style inlined — `leaveTo` if defined (explicit hidden-end state), else `enterFrom` (pre-enter state, covers the scroll-reveal pattern that only configures the enter side). The existing `watch(stage)` effect drives the enter animation when `show` flips true on the **same** DOM element.

  This matches ecosystem norm — Framer Motion, react-transition-group, react-spring, AutoAnimate all render children in SSR regardless of animation state. "Content is structural, animation is visual."

  **Companion fix in `applyEnter`.** Made symmetric to `applyLeave` — now removes residual `leave`/`leaveFrom`/`leaveTo` classes at start. Without this, the SSR-baked hidden-state class (or a class persisting after a leave-complete with `unmount: false`) would compete with `enterTo`'s CSS rules during the next enter cycle. This was a latent issue masked by `unmount: true` defaulting to "destroy element after leave-complete" — surfaced by the SSR fix because the element now stays in DOM.

  **Behaviour change to document.** For initially-hidden Transitions, `unmount: true` no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. Initially-visible Transitions keep the unmount semantic. This matches Framer Motion / react-transition-group conventions and is the price of SSR correctness; the rare user who needs true unmount on a started-hidden element can drive mount/unmount themselves outside `<Transition>`.

  **Coverage added.** New `Transition.ssr.test.tsx` (7 specs against real `renderToString` from `@pyreon/runtime-server`) + 2 new browser specs in `kinetic.browser.test.tsx` for the client-side initially-hidden mount + flip-to-shown path. Bisect-verified: reverting the `wasInitiallyShown` branch fails 6 of the 7 SSR specs with `expected '' to contain '<section'` (the empty-output bug); the 7th (initially-visible no-regression check) keeps passing in both states. Restored → 12 files / 204 vitest + 10 browser specs green.

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/runtime-dom@0.21.0

## 0.20.0

### Patch Changes

- [#646](https://github.com/pyreon/pyreon/pull/646) [`9ae6f42`](https://github.com/pyreon/pyreon/commit/9ae6f42fa0990c28173fbc7898c073d696a7ffff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): preserve reactive HTML-attr getters through the kinetic prop pipeline

  `createKineticComponent` value-copied user props twice — a `for…in`
  `htmlProps[key] = props[key]` split followed by a
  `const { children, ...restHtml } = htmlProps` rest-destructure — and all
  four renderers re-spread the result via `h(config.tag, { ...htmlProps })`.

  Pyreon's reactive-prop contract is that the compiler emits
  `<KineticDiv class={sig()}>` as `_rp(() => sig())`, which `mount.ts`'s
  `makeReactiveProps` converts into a **getter** on the props object. Every
  value-copy hop above read that getter once, at component-setup time,
  outside any tracking scope — collapsing it to a static snapshot. The
  attribute then froze forever: a signal write produced no DOM update on
  any `kinetic(tag)`-wrapped component (transition / collapse / stagger /
  group). Same bug class as the swept `@pyreon/rocketstyle` /
  `@pyreon/styler` / `@pyreon/ui-core` prop-pipeline fixes; unfixed here
  since package inception, shipped today, browser package.

  Fix routes every hop through descriptor-preserving primitives from
  `@pyreon/core`:

  - `createKineticComponent`: `splitProps(props, [...KINETIC_KEYS])` for the
    kinetic/html split, then `splitProps(htmlProps, ['children'])` to carve
    out children — getters survive (`Object.getOwnPropertyDescriptor` +
    `Object.defineProperty`).
  - `StaggerRenderer` / `GroupRenderer`: pass `htmlProps` **by reference**
    to `h(config.tag, …)` instead of `{ ...htmlProps }`.
  - `CollapseRenderer` / `TransitionRenderer`: `mergeProps(htmlProps, {
ref, style })` — last-source-wins lets `ref`/the animation-controlled
    `style` override while every other HTML-attr getter stays live.

  runtime-dom's `applyProps` already detects a getter descriptor on an
  `h()`-created element and wraps the read in a `renderEffect`
  (`props.ts:192-195`), so the live getter now drives reactive DOM
  patching end-to-end.

  Bisect-verified at the real-Chromium browser layer
  (`src/__tests__/kinetic.browser.test.tsx`): reverting
  `createKineticComponent`'s `splitProps` split back to the `for…in`
  value-copy fails the new reactive-attr specs with
  `expected 'two' to be 'one'` / `expected 'b' to be 'a'` across
  transition + collapse + stagger/group modes; restored → 8/8 pass.

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/runtime-dom@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- [#244](https://github.com/pyreon/pyreon/pull/244) [`c69e178`](https://github.com/pyreon/pyreon/commit/c69e178c2f0155c073a680f357ff71c8f9eec6a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Kinetic anti-pattern cleanup + lint rule precision

  `@pyreon/kinetic`:

  - `nextFrame` (utils.ts): added `typeof requestAnimationFrame === 'undefined'`
    early-return. SSR callers receive `0` instead of crashing — the rule
    recognises the guard and the safety contract becomes explicit.
  - `TransitionItem`, `TransitionRenderer`: replaced destructured props
    (`({ show, enter, leave, … }) => …`) with `props.x` access to preserve
    reactive prop tracking. Defaults hoisted out (`const appear = props.appear
?? false`).
  - Added `vitest.browser.config.ts` + `src/__tests__/kinetic.browser.test.tsx` —
    the package's first real Chromium smoke test. 5 tests covering Transition
    mount/child rendering, signal-driven show/hide, `nextFrame` scheduling,
    `mergeClassNames` filtering, and the `typeof process === 'undefined'` /
    `import.meta.env.DEV === true` checks that confirm the package works in
    a real browser bundle.
  - Removed `packages/ui-system/kinetic/` from `PHASE_5_PENDING_PACKAGES` in
    `scripts/check-browser-smoke.ts` (stale now that the smoke test exists).
  - Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
    `@pyreon/reactivity`, `@pyreon/runtime-dom` added.

  `@pyreon/lint` — `no-bare-signal-in-jsx`:

  - Skip allowlist extended to `h` and `cloneVNode` (VNode-producing helpers
    from `@pyreon/core`). Their JSX call sites always produce a VNode, not
    a signal value. Matches `render` (already in the list) from ui-core.

  `@pyreon/lint` — `no-window-in-ssr`:

  - Safe-context call set extended with `watch` (signal-driven watcher from
    `@pyreon/reactivity`) and `requestAnimationFrame`. Both run their
    callbacks post-mount in a browser, so browser-global reads inside them
    are safe.

  4 new bisect-verified regression tests for the rule precision changes.

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/runtime-dom@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/runtime-dom@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/runtime-dom@0.12.11

## 0.1.2

## 0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages
