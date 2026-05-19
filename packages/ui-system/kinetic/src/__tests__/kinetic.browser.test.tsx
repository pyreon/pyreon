/** @jsxImportSource @pyreon/core */
import { describe, expect, it } from 'vitest'
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
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
      <Transition show={show} onLeave={() => { onLeaveCalls++ }}>
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
    const el = container.querySelector('[data-id="reveal-target"]') as HTMLElement | null
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
      <Transition
        show={show}
        enterFrom="hide-state"
        enterTo="show-state"
        enter="enter-active"
      >
        <div data-id="reveal-target">content</div>
      </Transition>,
    )
    const el = () => container.querySelector('[data-id="reveal-target"]') as HTMLElement | null
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
})
