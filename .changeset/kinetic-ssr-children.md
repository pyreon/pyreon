---
'@pyreon/kinetic': minor
---

fix(kinetic): `<Transition show={() => false}>` now emits children in SSR (was: dropped from prerendered HTML)

**Bug.** `<Transition>` rendered `<Show when={shouldMount} fallback={null}>`; with the documented `unmount: true` default, an initially-hidden Transition (`show: () => false`) rendered `null` on the server. Any SSG site using kinetic for scroll-triggered reveal — the documented `useIntersection` + sticky-signal pattern, where `show` is false at SSR because IntersectionObserver can't fire until client hydration — shipped with the wrapped content **structurally absent** from the prerendered HTML. Bad for SEO, social scrapers, accessibility tools, and no-JS users.

**Why it shipped undetected.** Zero existing tests exercised `show: () => false` initial state, and zero kinetic tests touched the runtime-server path. Both layers needed — real `renderToString` + a hidden initial state — to surface the bug.

**Fix.** `Transition` now branches at setup on `props.show()`:

- **Initially-visible** Transitions keep the original `<Show>`-gated mount unchanged, preserving the runtime-unmount semantic for the visible→hidden transition (modals closing, dropdowns collapsing, etc.).
- **Initially-hidden** Transitions always render children with the hidden-state class/style inlined — `leaveTo` if defined (explicit hidden-end state), else `enterFrom` (pre-enter state, covers the scroll-reveal pattern that only configures the enter side). The existing `watch(stage)` effect drives the enter animation when `show` flips true on the **same** DOM element.

This matches ecosystem norm — Framer Motion, react-transition-group, react-spring, AutoAnimate all render children in SSR regardless of animation state. "Content is structural, animation is visual."

**Companion fix in `applyEnter`.** Made symmetric to `applyLeave` — now removes residual `leave`/`leaveFrom`/`leaveTo` classes at start. Without this, the SSR-baked hidden-state class (or a class persisting after a leave-complete with `unmount: false`) would compete with `enterTo`'s CSS rules during the next enter cycle. This was a latent issue masked by `unmount: true` defaulting to "destroy element after leave-complete" — surfaced by the SSR fix because the element now stays in DOM.

**Behaviour change to document.** For initially-hidden Transitions, `unmount: true` no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. Initially-visible Transitions keep the unmount semantic. This matches Framer Motion / react-transition-group conventions and is the price of SSR correctness; the rare user who needs true unmount on a started-hidden element can drive mount/unmount themselves outside `<Transition>`.

**Coverage added.** New `Transition.ssr.test.tsx` (7 specs against real `renderToString` from `@pyreon/runtime-server`) + 2 new browser specs in `kinetic.browser.test.tsx` for the client-side initially-hidden mount + flip-to-shown path. Bisect-verified: reverting the `wasInitiallyShown` branch fails 6 of the 7 SSR specs with `expected '' to contain '<section'` (the empty-output bug); the 7th (initially-visible no-regression check) keeps passing in both states. Restored → 12 files / 204 vitest + 10 browser specs green.
