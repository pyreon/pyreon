/**
 * SSR regression coverage for `<Transition>` (the missing test layer that
 * let the children-dropped-on-SSR bug ship).
 *
 * Background. `<Transition show={() => false} ...>` used to render `<Show
 * when={false} fallback={null}>` on the server, which emitted EMPTY HTML —
 * any SSG site using kinetic for scroll-triggered reveal (the documented
 * `useIntersection` + sticky-signal pattern, where `show` is false at SSR
 * because IntersectionObserver can't fire until client hydration) shipped
 * with the wrapped content STRUCTURALLY ABSENT from the prerendered HTML.
 * Bad for SEO, social scrapers, accessibility tools, and no-JS users.
 *
 * Ecosystem norm (the framing this fix aligns Pyreon with): Framer Motion,
 * react-transition-group, react-spring, AutoAnimate all render children in
 * SSR regardless of animation state and only apply animation styles on the
 * client. "Content is structural, animation is visual."
 *
 * What the fix changes. `Transition` now branches at setup on
 * `props.show()`:
 *   - initially-visible → existing `<Show>`-gated mount (unchanged;
 *     preserves the runtime-unmount semantic for the visible→hidden case)
 *   - initially-hidden → always render children with hidden-state classes
 *     inlined (`leaveTo` if defined, else `enterFrom` — covers the
 *     scroll-reveal pattern that only configures the enter side). The
 *     existing `watch(stage)` effect drives the enter animation when
 *     `show` flips true.
 *
 * Why these tests are load-bearing. Zero existing tests exercised
 * `show: () => false` initial state (the bug class). The fact that this
 * shipped is exactly the "no test catches it because no test runs the real
 * path" failure mode the `test-environment-parity.md` rule was written to
 * prevent — both real `h()` AND a SSR-driving environment (`renderToString`)
 * are needed to catch it.
 *
 * Bisect-verified: reverting `Transition.tsx`'s `wasInitiallyShown` branch
 * fails every spec below with `expected '' to contain '...'` (the empty-
 * children bug). Restored → all green.
 */

import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import Transition from '../Transition'

describe('Transition — SSR / initially-hidden children render', () => {
  it('emits children when show=false initially (was: <Show fallback={null}> → empty)', async () => {
    // The canonical bug shape — scroll-reveal pattern at SSR time.
    const html = await renderToString(
      h(Transition, {
        show: () => false,
        enterFrom: 'opacity-0',
        enterTo: 'opacity-100',
        enter: 'transition-opacity duration-300',
        children: h('section', null, 'real content for SEO + social scrapers'),
      }),
    )
    // Structural content must land in the prerendered HTML. Pre-fix this
    // assertion failed with `expected '' to contain '...'`.
    expect(html).toContain('<section')
    expect(html).toContain('real content for SEO + social scrapers')
  })

  it('inlines `leaveTo` as the hidden-state class (explicit hidden-end state takes precedence)', async () => {
    const html = await renderToString(
      h(Transition, {
        show: () => false,
        enterFrom: 'opacity-0 translate-y-4', // present but NOT selected
        enterTo: 'opacity-100 translate-y-0',
        leave: 'transition-opacity',
        leaveFrom: 'opacity-100',
        leaveTo: 'is-hidden opacity-0', // ← explicit hidden-end state, selected
        children: h('div', null, 'panel content'),
      }),
    )
    expect(html).toContain('is-hidden opacity-0')
    expect(html).toContain('panel content')
    // The competing `enterFrom` should NOT be applied (leaveTo wins).
    expect(html).not.toContain('translate-y-4')
  })

  it('falls back to `enterFrom` as the hidden class for scroll-reveal patterns (only enter side configured)', async () => {
    // The exact pattern the reported bug surfaced on — only the enter
    // animation is configured (because IO triggers `show` true; there's
    // no leave side for the reveal pattern).
    const html = await renderToString(
      h(Transition, {
        show: () => false,
        enter: 'transition-all duration-700',
        enterFrom: 'opacity-0 translate-y-8',
        enterTo: 'opacity-100 translate-y-0',
        children: h('section', { id: 'resume-section' }, 'work history goes here'),
      }),
    )
    expect(html).toContain('id="resume-section"')
    expect(html).toContain('work history goes here')
    // enterFrom IS the resting hidden state for this pattern.
    expect(html).toContain('opacity-0 translate-y-8')
  })

  it('inlines `leaveToStyle` as the hidden inline style when defined', async () => {
    const html = await renderToString(
      h(Transition, {
        show: () => false,
        leaveTo: 'animated-section',
        leaveToStyle: { opacity: 0, transform: 'translateY(20px)' },
        children: h('article', null, 'article body'),
      }),
    )
    expect(html).toContain('article body')
    expect(html).toContain('opacity: 0')
    expect(html).toContain('translateY(20px)')
  })

  it('falls back to `enterStyle` as hidden style when leaveToStyle undefined (preset path)', async () => {
    // The preset shape — `@pyreon/kinetic-presets` factories (fadeUp,
    // blurInUp, slideLeft, …) populate `enterStyle` as the hidden state
    // but may not set `leaveToStyle`. PR #717 shipped the
    // `wasInitiallyShown` branch with `hiddenStyle = props.leaveToStyle`
    // alone — so preset users SSR-rendered VISIBLE → flash-on-hydration.
    // This regression test locks in the `?? props.enterStyle` fallback
    // that aligns the style picker with the existing
    // `hiddenClass = leaveTo ?? enterFrom` class picker.
    //
    // The companion `kinetic(tag).<mode>` paths (TransitionRenderer /
    // TransitionItem / CollapseRenderer) got the same fallback in #719;
    // this commit closes the matching gap on the direct `<Transition>`
    // import path.
    const html = await renderToString(
      h(Transition, {
        show: () => false,
        enter: 'transition-all duration-300',
        enterStyle: { opacity: 0, transform: 'translateY(16px)' },
        enterToStyle: { opacity: 1, transform: 'translateY(0)' },
        children: h('section', null, 'preset-shaped hidden state'),
      }),
    )
    expect(html).toContain('preset-shaped hidden state')
    expect(html).toContain('opacity: 0')
    expect(html).toContain('translateY(16px)')
  })

  it('merges the hidden class with any user-set class on the child', async () => {
    const html = await renderToString(
      h(Transition, {
        show: () => false,
        leaveTo: 'is-hidden',
        children: h('div', { class: 'card card--featured' }, 'merged-class content'),
      }),
    )
    expect(html).toContain('merged-class content')
    expect(html).toContain('card')
    expect(html).toContain('card--featured')
    expect(html).toContain('is-hidden')
  })

  it('emits children unchanged when neither leaveTo nor enterFrom is defined (graceful no-op)', async () => {
    // An unusual config — no enter/leave classes at all. Children should
    // still render structurally (the SEO/SSG contract); no hidden class
    // is appended because there's nothing to append.
    const html = await renderToString(
      h(Transition, {
        show: () => false,
        children: h('div', null, 'bare content'),
      }),
    )
    expect(html).toContain('bare content')
  })

  it('initially-visible Transition (show=true) renders children normally — unchanged behavior', async () => {
    // The other branch of the fix — initially-visible Transitions keep
    // the original `<Show>`-gated path. This spec locks in the no-
    // regression contract for the existing common case.
    const html = await renderToString(
      h(Transition, {
        show: () => true,
        leaveTo: 'is-hidden', // must NOT leak onto initially-visible
        children: h('main', null, 'visible from the start'),
      }),
    )
    expect(html).toContain('visible from the start')
    expect(html).not.toContain('is-hidden')
  })
})
