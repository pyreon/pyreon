/**
 * REPRODUCTION + REGRESSION — vue-compat's `provide()` and `createApp().provide()`
 * both used position-based `popContext()` (or no pop at all) to release the
 * context-stack frames they pushed. Same bug class as #725 (`@pyreon/core`'s
 * provide) and #729 (ErrorBoundary stack) — see those for the underlying
 * theory.
 *
 * Bug shapes:
 *
 * 1) Component-level `provide(key, value)` — pushed a Map and registered
 *    `unmountCallbacks.push(() => popContext())`. `popContext` pops `stack.pop()`
 *    (the last frame). When sibling components unmount out-of-order (renderer-
 *    driven `<For>` removal, `<Show>` flipping a non-last sibling), the first
 *    sibling's onUnmount popped the LAST sibling's frame. Context stack
 *    corruption + orphaned frames at the top forever.
 *
 * 2) `createApp(C).provide('K', v).mount(el)` pushed app-level provisions
 *    BEFORE the mount but the returned unmount only ran `pyreonMount`'s
 *    cleanup — leaving the app-level frames on the global context stack
 *    forever, one per provision per mount cycle.
 *
 * Fix: identity-based removal via the newly-exported `removeContextFrame` from
 * `@pyreon/core`. `provide` captures the frame at push, removes by reference.
 * `createApp.mount` tracks every pushed app-level frame and removes each on
 * unmount.
 */
import { getContextStackLength, h as pyreonH } from '@pyreon/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, inject } from '../index'

describe('vue-compat — provide/popContext is identity-safe (#725/#729 class)', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('REGRESSION: createApp().provide(k, v).mount(el); unmount() — context stack returns to baseline', () => {
    const baseLen = getContextStackLength()

    function Root() {
      const v = inject<string>('K')
      return pyreonH('span', { 'data-testid': 'val' }, v ?? 'missing')
    }

    const unmount = createApp(Root).provide('K', 'hello').mount(container)

    // Sanity: the value was actually injected (proves the push reached the
    // child) — prevents the regression test from passing vacuously.
    expect(container.querySelector('[data-testid="val"]')?.textContent).toBe('hello')

    unmount()

    // The critical assertion: app-level provision frames are removed on
    // unmount. Pre-fix the stack accumulates one frame per provision per
    // mount cycle, forever.
    expect(getContextStackLength()).toBe(baseLen)
  })

  it('REGRESSION: 100 mount/unmount cycles do NOT accumulate context-stack frames', () => {
    const baseLen = getContextStackLength()

    function Root() {
      return pyreonH('span', null, 'x')
    }

    for (let i = 0; i < 100; i++) {
      const unmount = createApp(Root).provide('A', i).provide('B', i + 1000).mount(container)
      unmount()
    }

    // Pre-fix: each mount pushes 2 frames, unmount removes 0 → 200 orphan
    // frames after 100 cycles. Post-fix: stack returns to baseline.
    const delta = getContextStackLength() - baseLen
    expect(delta).toBeLessThan(5) // allow tiny noise from other unrelated test infra
  })
})
