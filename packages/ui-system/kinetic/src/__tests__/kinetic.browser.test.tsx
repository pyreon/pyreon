/** @jsxImportSource @pyreon/core */
import { describe, expect, it } from 'vitest'
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { queryOptional } from '@pyreon/test-utils'
import kinetic from '../kinetic'
import { nextFrame, mergeClassNames } from '../utils'
import Transition from '../Transition'

describe('@pyreon/kinetic browser smoke', () => {
  // Regression: createKineticComponent + the 4 renderers used to value-copy
  // user props (`for…in` / `const { children, ...rest }` / `{ ...htmlProps }`),
  // firing every getter at component-setup time. The compiler emits a
  // reactive HTML attr as `_rp(() => sig())`; mount.ts's makeReactiveProps
  // turns it into a getter on `props`. The value-copy collapsed that getter
  // to a static snapshot, freezing the attribute forever. The fix routes
  // every hop through descriptor-preserving splitProps / mergeProps / by-ref
  // so runtime-dom's applyProps detects the getter descriptor and wraps the
  // read in a renderEffect. Bisect-verified: reverting createKineticComponent's
  // splitProps split back to `for…in` fails this with `expected 'a' to be 'b'`.
  it('forwards a reactive HTML attr through the kinetic pipeline (descriptor-preserving)', async () => {
    const FadeDiv = kinetic('div')
    const show = signal(true)
    const v = signal('a')
    const { container, unmount } = mountInBrowser(
      h(
        FadeDiv,
        { show, 'data-testid': 'fd', 'data-variant': _rp(() => v()) },
        h('span', { 'data-id': 'kc' }, 'hi'),
      ),
    )
    const el = () => container.querySelector('[data-testid="fd"]')
    expect(el()?.getAttribute('data-variant')).toBe('a')
    v.set('b')
    await flush()
    expect(el()?.getAttribute('data-variant')).toBe('b')
    unmount()
  })

  it('Transition mounts a visible child into real DOM', async () => {
    const show = signal(true)
    const { container, unmount } = mountInBrowser(
      <Transition show={show}>
        <div data-id="t">hello</div>
      </Transition>,
    )
    const el = container.querySelector('[data-id="t"]')
    expect(el?.textContent).toBe('hello')
    unmount()
  })

  it('Transition fires onLeave when show signal goes true → false', async () => {
    let onLeaveCalls = 0
    const show = signal(true)
    const { unmount } = mountInBrowser(
      <Transition
        show={show}
        onLeave={() => {
          onLeaveCalls++
        }}
      >
        <div data-id="t">hi</div>
      </Transition>,
    )
    expect(onLeaveCalls).toBe(0)
    show.set(false)
    await flush()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    // onLeave fires once the leave transition starts — asserts the
    // signal → stage machine → lifecycle callback path ran end-to-end.
    expect(onLeaveCalls).toBe(1)
    unmount()
  })

  it('nextFrame schedules a callback via requestAnimationFrame', async () => {
    let fired = false
    nextFrame(() => {
      fired = true
    })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    expect(fired).toBe(true)
  })

  it('mergeClassNames filters empty + joins', () => {
    expect(mergeClassNames('a', 'b')).toBe('a b')
    expect(mergeClassNames('a', undefined)).toBe('a')
    expect(mergeClassNames(undefined, undefined)).toBe(undefined)
  })

  // Regression: a kinetic-wrapped component must FORWARD a compiler-shaped
  // reactive HTML attr (`<KineticDiv class={sig()}>` → `_rp(() => sig())`,
  // which `makeReactiveProps` turns into a getter on `props`) so the DOM
  // patches when the signal changes. The factory's prop split + the
  // renderers' element spread used to value-copy props, firing the getter
  // once at setup and freezing the attribute. We build the vnode with
  // `h()` + `_rp()` directly because this browser config has no Pyreon
  // compiler plugin — that faithfully reproduces the exact post-
  // makeReactiveProps shape the mount pipeline sees in a real app.
  //
  // Bisect-verified: revert createKineticComponent's splitProps back to
  // `htmlProps[key] = props[key]` → this fails with the className stuck
  // at 'one' (`expected 'one' to be 'two'`). Restored → passes.
  it('forwards a compiler-shaped reactive HTML attr — DOM patches on signal change (transition mode)', async () => {
    const KineticDiv = kinetic('div')
    const cls = signal('one')
    const { container, unmount } = mountInBrowser(
      h(
        KineticDiv,
        { show: () => true, class: _rp(() => cls()) },
        h('span', { 'data-id': 'k' }, 'x'),
      ),
    )
    const el = () => container.querySelector('div')
    expect(el()?.querySelector('[data-id="k"]')?.textContent).toBe('x')
    expect(el()?.className).toBe('one')

    cls.set('two')
    await flush()
    expect(el()?.className).toBe('two')

    cls.set('three')
    await flush()
    expect(el()?.className).toBe('three')
    unmount()
  })

  it('forwards a compiler-shaped reactive HTML attr — collapse mode (mergeProps path)', async () => {
    const KineticDiv = kinetic('div').collapse()
    const cls = signal('a')
    const { container, unmount } = mountInBrowser(
      h(
        KineticDiv,
        { show: () => true, class: _rp(() => cls()) },
        h('span', { 'data-id': 'c' }, 'y'),
      ),
    )
    const el = () => container.querySelector('div')
    expect(el()?.className).toBe('a')
    cls.set('b')
    await flush()
    expect(el()?.className).toBe('b')
    unmount()
  })

  it('runs in a real browser — Vitest defines `process.env.NODE_ENV !== "production"`', () => {
    // Sanity check the test env: dev gates use bundler-agnostic
    // `process.env.NODE_ENV !== 'production'`. Vitest's Vite pipeline
    // replaces this at build time so the literal lands as
    // `"development" !== "production"` → `true` in dev runs.
    expect(process.env.NODE_ENV).not.toBe('production')
  })

  // ── Initially-hidden Transition: client-side parity with the SSR fix ─────
  //
  // The SSR test file (`Transition.ssr.test.tsx`) proves children land in
  // prerendered HTML; these specs prove the SAME render path works under
  // a real DOM — the element mounts with the hidden-state class applied,
  // and an `applyEnter` triggered by a `show` flip cleanly transitions it
  // out of the hidden state (the companion `applyEnter` fix that removes
  // residual `leave`/`leaveFrom`/`leaveTo` classes ensures the SSR-baked
  // hidden class doesn't fight `enterTo`).

  it('Transition with initial show=false mounts the element with the hidden class (no null)', async () => {
    const show = signal(false)
    const { container, unmount } = mountInBrowser(
      <Transition
        show={show}
        enterFrom="hide-state"
        enterTo="show-state"
        enter="transition-opacity"
      >
        <div data-id="reveal-target">scroll-reveal content</div>
      </Transition>,
    )
    // Pre-fix: container.querySelector returns null (children were dropped).
    const el = queryOptional<HTMLElement>(container, '[data-id="reveal-target"]')
    expect(el).not.toBeNull()
    expect(el!.textContent).toBe('scroll-reveal content')
    // enterFrom is the fallback hidden-state class (scroll-reveal pattern
    // configures only the enter side).
    expect(el!.classList.contains('hide-state')).toBe(true)
    unmount()
  })

  it('flipping show=true on an initially-hidden Transition cleans the hidden class and runs enter', async () => {
    const show = signal(false)
    const { container, unmount } = mountInBrowser(
      <Transition show={show} enterFrom="hide-state" enterTo="show-state" enter="enter-active">
        <div data-id="reveal-target">content</div>
      </Transition>,
    )
    const el = () => queryOptional<HTMLElement>(container, '[data-id="reveal-target"]')
    // Starts hidden.
    expect(el()!.classList.contains('hide-state')).toBe(true)
    // Flip show → true; applyEnter runs in the watch effect on the SAME
    // element (the SSR fix guarantees the element is already in DOM).
    show.set(true)
    await flush()
    // The companion applyEnter fix removes residual `leave`/`leaveFrom`/
    // `leaveTo` AND adds `enter` + `enterFrom`. enterFrom was already
    // applied (it WAS the hidden-state class); the next frame removes it
    // and adds enterTo. Two rAFs for full transition.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    await flush()
    // After the double-rAF, enterTo is applied + enterFrom removed.
    expect(el()!.classList.contains('show-state')).toBe(true)
    expect(el()!.classList.contains('hide-state')).toBe(false)
    // `enter` (the active marker) is applied throughout the transition.
    expect(el()!.classList.contains('enter-active')).toBe(true)
    unmount()
  })

  // ── Initially-hidden kinetic(tag).<mode> — client-side parity with SSR ──
  //
  // Companion to PR #717's `<Transition>` direct-import specs (the two
  // above). These exercise the `kinetic(tag).<mode>` factory paths — the
  // README's primary documented surface — whose per-mode renderers carried
  // the same SSR-children-dropped bug until this PR fixed them. SSR specs
  // in `kinetic-modes.ssr.test.tsx` prove children land in prerendered
  // HTML; these specs prove the SAME render path works under a real DOM —
  // the element mounts with the hidden-state class/style applied, and an
  // `applyEnter` triggered by a `show` flip cleanly transitions it out.

  it('kinetic("div").transition with initial show=false mounts element with hidden class', async () => {
    const Reveal = kinetic('section').enterClass({
      active: 'enter-active',
      from: 'hide-state',
      to: 'show-state',
    })
    const show = signal(false)
    const { container, unmount } = mountInBrowser(
      h(Reveal, { show, 'data-id': 'reveal-target' }, h('p', null, 'scroll-reveal content')),
    )
    // Pre-fix: container.querySelector returns null (children dropped).
    const el = queryOptional<HTMLElement>(container, '[data-id="reveal-target"]')
    expect(el).not.toBeNull()
    expect(el!.textContent).toContain('scroll-reveal content')
    // enterFrom is the fallback hidden-state class (scroll-reveal pattern
    // configures only the enter side).
    expect(el!.classList.contains('hide-state')).toBe(true)
    unmount()
  })

  it('kinetic("div").transition show=true flip cleans hidden class + runs enter animation', async () => {
    const Reveal = kinetic('section').enterClass({
      active: 'enter-active',
      from: 'hide-state',
      to: 'show-state',
    })
    const show = signal(false)
    const { container, unmount } = mountInBrowser(
      h(Reveal, { show, 'data-id': 'reveal-target' }, h('p', null, 'content')),
    )
    const el = () => queryOptional<HTMLElement>(container, '[data-id="reveal-target"]')
    expect(el()!.classList.contains('hide-state')).toBe(true)

    show.set(true)
    await flush()
    // Double-rAF for the applyEnter nextFrame → enterTo applied.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    await flush()

    expect(el()!.classList.contains('show-state')).toBe(true)
    // enterFrom (hide-state) was removed; the symmetric applyEnter cleanup
    // ALSO removes leave-side classes (none here) — locks in the
    // companion fix that prevents residual hidden classes from fighting
    // enterTo's CSS rules.
    expect(el()!.classList.contains('hide-state')).toBe(false)
    expect(el()!.classList.contains('enter-active')).toBe(true)
    unmount()
  })

  it('kinetic("ul").stagger() with initial show=false mounts all items with hidden class', async () => {
    // The reported real-app cascading-Stagger pattern at SSR. Each per-item
    // TransitionItem must render structurally; the hidden class lands on
    // each item via the enterFrom fallback.
    const Staggered = kinetic('ul')
      .enterClass({ active: 'enter-active', from: 'item-hidden', to: 'item-shown' })
      .stagger({ interval: 50 })
    const show = signal(false)
    const { container, unmount } = mountInBrowser(
      h(Staggered, { show, 'data-id': 'stagger-list' }, [
        h('li', { key: 'a' }, 'first item'),
        h('li', { key: 'b' }, 'second item'),
        h('li', { key: 'c' }, 'third item'),
      ]),
    )
    const list = queryOptional<HTMLElement>(container, '[data-id="stagger-list"]')
    expect(list).not.toBeNull()
    const items = list!.querySelectorAll('li')
    expect(items.length).toBe(3)
    // Every per-item TransitionItem applies the hidden class.
    for (const item of items) {
      expect(item.classList.contains('item-hidden')).toBe(true)
    }
    expect(list!.textContent).toContain('first item')
    expect(list!.textContent).toContain('second item')
    expect(list!.textContent).toContain('third item')
    unmount()
  })

  it('kinetic("div").collapse() with initial show=false mounts inner content (visually hidden via height:0)', async () => {
    // CollapseRenderer's fix: outer wrapper retains height:0 + overflow:hidden
    // (layout-safe visual hiding); inner content is always rendered so SSG
    // ships the structural HTML for SEO. Real-DOM parity check.
    const Accordion = kinetic('div').collapse()
    const show = signal(false)
    const { container, unmount } = mountInBrowser(
      h(
        Accordion,
        { show, 'data-id': 'accordion' },
        h('div', { 'data-id': 'inner' }, 'accordion content'),
      ),
    )
    const wrapper = queryOptional<HTMLElement>(container, '[data-id="accordion"]')
    const inner = queryOptional<HTMLElement>(container, '[data-id="inner"]')
    expect(wrapper).not.toBeNull()
    expect(inner).not.toBeNull() // ← was null pre-fix (Show dropped it)
    expect(inner!.textContent).toBe('accordion content')
    // Outer wrapper visually hides via height:0 (computed style — real CSS).
    expect(wrapper!.style.height).toBe('0px')
    expect(wrapper!.style.overflow).toBe('hidden')
    unmount()
  })
})
