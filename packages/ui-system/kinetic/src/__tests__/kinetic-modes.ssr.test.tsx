/**
 * SSR regression coverage for the `kinetic(tag).<mode>` API — the three
 * renderer files PR #717 didn't reach:
 *
 *   - `TransitionRenderer`  → `kinetic('div').preset(...)` (default
 *     `.transition` mode — the README's main example)
 *   - `TransitionItem`      → `kinetic('ul').stagger()` per item (the
 *     cascade-children mode); transitively `kinetic('ul').group()`
 *   - `CollapseRenderer`    → `kinetic('div').collapse()` (height-animation
 *     mode)
 *
 * Background. The top-level `<Transition>` was fixed in PR #717. But the
 * `kinetic(tag).<mode>` API — which the README promotes as the primary
 * surface — has its own per-mode renderers, and all three carried the
 * SAME `<Show when={shouldMount} fallback={null}>` shape, dropping
 * children from prerendered HTML when `show()` is false at SSR. That
 * meant every documented `kinetic(tag).<mode>` consumer hit the bug
 * even after #717 landed — including the cascading-Stagger pattern this
 * report's author flagged on a real resume page.
 *
 * The fix mirrors #717: branch each renderer at setup on `props.show()`.
 * Initially-visible → existing `<Show>`-gated mount (preserves runtime-
 * unmount semantic). Initially-hidden → always render the inner content
 * with the hidden-state class/style inlined; the existing `watch(stage)`
 * effect drives the enter animation when `show` flips true.
 *
 * Hidden-state picker (mirrors #717): `leaveTo` / `leaveToStyle` win
 * (explicit hidden-end state); fall back to `enterFrom` / `enterStyle`
 * (pre-enter state). The `enterStyle` fallback covers the preset path —
 * `@pyreon/kinetic-presets` factories populate `enterStyle` as the
 * hidden state but may not set `leaveToStyle`. Without the fallback,
 * preset users would SSR-render VISIBLE → flash-on-hydration.
 *
 * API note. `kinetic(tag)` takes animation config via CHAIN methods
 * (`.enter()`, `.enterClass({from, to, active})`, `.leaveClass(...)`,
 * `.preset()`), NOT as runtime props. Runtime props are limited to
 * `show` / `appear` / `unmount` / `timeout` plus HTML attributes —
 * anything else gets forwarded to the rendered element. The tests
 * below use the chain API to faithfully exercise real user code.
 *
 * Coverage layered with PR #717: the test file there
 * (`Transition.ssr.test.tsx`) covers the direct `<Transition>` import
 * path; this file covers the `kinetic(tag).<mode>` factory paths.
 */

import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import kinetic from '../kinetic'

describe('kinetic(tag).transition — SSR / initially-hidden (TransitionRenderer)', () => {
  it('emits children when show=false initially (kinetic-mode shape, was: empty wrapper)', async () => {
    // Cascading-bug shape — every `kinetic('div').preset(...)` user with a
    // scroll-reveal `show` accessor hit this. Pre-fix: outer wrapper renders
    // but children are dropped by the inner Show fallback.
    const FadeSection = kinetic('section').enterClass({
      active: 'transition-all duration-300',
      from: 'opacity-0',
      to: 'opacity-100',
    })
    const html = await renderToString(
      h(FadeSection, { show: () => false },
        h('h2', null, 'Work Experience'),
        h('p', null, 'real content for SEO + social scrapers'),
      ),
    )
    expect(html).toContain('<h2')
    expect(html).toContain('Work Experience')
    expect(html).toContain('real content for SEO + social scrapers')
  })

  it('inlines `leaveTo` class over `enterFrom` (explicit hidden-end state wins)', async () => {
    const Panel = kinetic('aside')
      .enterClass({ from: 'translate-y-4', to: 'translate-y-0' })
      .leaveClass({ to: 'is-hidden opacity-0' })
    const html = await renderToString(
      h(Panel, { show: () => false },
        h('div', null, 'panel content'),
      ),
    )
    expect(html).toContain('is-hidden opacity-0')
    expect(html).toContain('panel content')
    // leaveTo wins — the competing enterFrom should NOT be applied.
    expect(html).not.toContain('translate-y-4')
  })

  it('inlines `enterStyle` as hidden style when leaveToStyle undefined (preset path)', async () => {
    // The preset shape — `@pyreon/kinetic-presets` factories populate
    // `enterStyle` (= `.enter()` chain) as the hidden state. Without the
    // enterStyle fallback, SSR would render VISIBLE → flash-on-hydration.
    // This locks in the critical preset-compatibility behaviour.
    const FadeUpDiv = kinetic('div')
      .enter({ opacity: 0, transform: 'translateY(16px)' })
      .enterTo({ opacity: 1, transform: 'translateY(0)' })
      .enterTransition('all 300ms ease-out')
    const html = await renderToString(
      h(FadeUpDiv, { show: () => false },
        h('h1', null, 'preset-shaped hidden state'),
      ),
    )
    expect(html).toContain('preset-shaped hidden state')
    expect(html).toContain('opacity: 0')
    expect(html).toContain('translateY(16px)')
  })

  it('initially-visible (show=true) renders normally — unchanged behaviour', async () => {
    const FadeDiv = kinetic('div').leaveClass({ to: 'is-hidden' })
    const html = await renderToString(
      h(FadeDiv, { show: () => true },
        h('main', null, 'visible from the start'),
      ),
    )
    expect(html).toContain('visible from the start')
    // leaveTo must NOT leak onto the initially-visible render.
    expect(html).not.toContain('is-hidden')
  })

  it('falls back to `enterFrom` class for scroll-reveal patterns (only enter side configured)', async () => {
    const RevealSection = kinetic('section').enterClass({
      active: 'transition-all duration-700',
      from: 'opacity-0 translate-y-8',
      to: 'opacity-100 translate-y-0',
    })
    const html = await renderToString(
      h(RevealSection, { show: () => false, id: 'resume-section' },
        h('p', null, 'work history goes here'),
      ),
    )
    expect(html).toContain('id="resume-section"')
    expect(html).toContain('work history goes here')
    expect(html).toContain('opacity-0 translate-y-8')
  })
})

describe('kinetic(tag).stagger() — SSR / initially-hidden (TransitionItem per item)', () => {
  it('emits all child items when show=false initially (cascading stagger SSR shape)', async () => {
    // The reported real-app pattern: cascading intro / list reveal.
    // Pre-fix: every per-item TransitionItem rendered null on the server,
    // dropping the full list from prerendered HTML.
    const StaggerList = kinetic('ul')
      .enterClass({
        active: 'transition-all',
        from: 'opacity-0 translate-y-4',
        to: 'opacity-100 translate-y-0',
      })
      .stagger({ interval: 80 })
    const html = await renderToString(
      h(StaggerList, { show: () => false },
        [
          h('li', { key: 'h' }, 'Heading'),
          h('li', { key: 't' }, 'tagline content'),
          h('li', { key: 's' }, 'social icons row'),
        ],
      ),
    )
    expect(html).toContain('Heading')
    expect(html).toContain('tagline content')
    expect(html).toContain('social icons row')
    // Every per-item TransitionItem should apply the hidden class
    // (enterFrom in this scroll-reveal shape).
    const occurrences = (html.match(/opacity-0 translate-y-4/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(3)
  })

  it('initially-visible stagger (show=true) renders all items unchanged', async () => {
    const StaggerList = kinetic('ul')
      .enterClass({ from: 'opacity-0', to: 'opacity-100' })
      .leaveClass({ to: 'is-hidden' })
      .stagger({ interval: 50 })
    const html = await renderToString(
      h(StaggerList, { show: () => true },
        [h('li', { key: 'a' }, 'item-a'), h('li', { key: 'b' }, 'item-b')],
      ),
    )
    expect(html).toContain('item-a')
    expect(html).toContain('item-b')
    // leaveTo must NOT leak onto visible items.
    expect(html).not.toContain('is-hidden')
  })
})

describe('kinetic(tag).collapse() — SSR / initially-hidden (CollapseRenderer)', () => {
  it('emits inner content when show=false initially (was: empty 0-height wrapper)', async () => {
    // Pre-fix: outer wrapper renders with `height: 0; overflow: hidden`
    // but its children are stripped by the inner Show — empty wrapper in
    // prerendered HTML. The fix keeps the outer wrapper's visual hiding
    // (height: 0 IS the layout-safe collapse mechanism — flex slots see
    // a 0-height box, no slot-collapse) while always rendering inner content.
    const Accordion = kinetic('div').collapse()
    const html = await renderToString(
      h(Accordion, { show: () => false },
        h('div', { class: 'panel-body' }, 'accordion panel content for SEO'),
      ),
    )
    expect(html).toContain('accordion panel content for SEO')
    expect(html).toContain('panel-body')
    // The outer wrapper retains the collapse-controlled hidden style —
    // visual hiding via height:0 + overflow:hidden, not by dropping children.
    expect(html).toContain('height: 0px')
    expect(html).toContain('overflow: hidden')
  })

  it('initially-visible collapse (show=true) renders content normally', async () => {
    const Accordion = kinetic('section').collapse()
    const html = await renderToString(
      h(Accordion, { show: () => true },
        h('p', null, 'expanded content'),
      ),
    )
    expect(html).toContain('expanded content')
    // height: 'auto' is the entered-state hint
    expect(html).toContain('height: auto')
  })
})
