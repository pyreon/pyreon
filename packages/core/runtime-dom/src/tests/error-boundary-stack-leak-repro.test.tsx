/**
 * REGRESSION: sibling `<ErrorBoundary>`s that unmount in any order keep
 * catching their own children's errors.
 *
 * History (#725 class): boundaries used to live on a module-level stack, and
 * `onUnmount` popped it by POSITION, so unmounting a non-last sibling removed
 * the wrong handler and later errors went to a disposed boundary and vanished.
 * Identity removal fixed that; since #4831 a boundary is not on a stack at all:
 * it `provide()`s its handler, which dies with its owner scope, and errors
 * resolve through the owner chain. These specs still lock the observable
 * contract: unmount order never steals or orphans a surviving boundary.
 */
import type { VNodeChild } from '@pyreon/core'
import { ErrorBoundary, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '..'

describe('ErrorBoundary — module-level stack cleanup is identity-safe (#725 class)', () => {
  let container: HTMLElement
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    container.remove()
    errorSpy.mockRestore()
  })

  // Tiny `h`-builder helpers so the tests stay readable.
  const eb = (testId: string, ...children: VNodeChild[]) =>
    h(
      ErrorBoundary,
      {
        fallback: (err: unknown) =>
          h('div', { 'data-testid': `fb-${testId}` }, `caught(${testId}): ${String(err)}`),
        children: children.length === 1 ? children[0] : children,
      },
    )

  const showWhen = (when: () => boolean, child: () => VNodeChild) =>
    h(Show, { when, children: child })

  it('REGRESSION: surviving sibling boundary still catches errors after a sibling unmounts (FIRST unmounted)', () => {
    const showA = signal(false)
    const showB = signal(false)
    const aliveA = signal(true)

    function Bomb({ name }: { name: string }): never {
      throw new Error(`boom-${name}`)
    }

    const App = () =>
      h(
        'div',
        null,
        // Boundary A — wrapped in Show so we can UNMOUNT it without
        // touching boundary B.
        showWhen(
          () => aliveA(),
          () => eb('A', showWhen(() => showA(), () => h(Bomb, { name: 'A' }))),
        ),
        // Boundary B — always mounted.
        eb('B', showWhen(() => showB(), () => h(Bomb, { name: 'B' }))),
      )

    const unmount = mount(h(App, null), container)

    expect(container.querySelector('[data-testid="fb-A"]')).toBeNull()
    expect(container.querySelector('[data-testid="fb-B"]')).toBeNull()

    // UNMOUNT boundary A (FIRST sibling). Pre-fix: popErrorBoundary() pops
    // the LAST frame — B's handler — instead of A's.
    aliveA.set(false)

    // Now trigger a throw inside B's children. With B's handler correctly
    // still on the stack (post-fix), B's fallback should render.
    showB.set(true)

    const fbB = container.querySelector('[data-testid="fb-B"]')
    expect(fbB).toBeTruthy()
    expect(fbB?.textContent).toContain('caught(B): Error: boom-B')

    // And the throw must NOT have been routed to A's (stale) fallback.
    expect(container.querySelector('[data-testid="fb-A"]')).toBeNull()

    unmount()
  })

  it('LIFO case: surviving FIRST boundary catches errors after a LATER sibling unmounts', () => {
    // Pre-fix this case worked (LIFO held for last-unmount). Included
    // as a guard against the fix regressing the LIFO case.
    const showA = signal(false)
    const aliveB = signal(true)

    function Bomb({ name }: { name: string }): never {
      throw new Error(`boom-${name}`)
    }

    const App = () =>
      h(
        'div',
        null,
        eb('A', showWhen(() => showA(), () => h(Bomb, { name: 'A' }))),
        showWhen(() => aliveB(), () => eb('B', null)),
      )

    const unmount = mount(h(App, null), container)

    // Unmount B — LIFO case (last sibling). Both pre- and post-fix correct.
    aliveB.set(false)

    showA.set(true)
    const fbA = container.querySelector('[data-testid="fb-A"]')
    expect(fbA).toBeTruthy()
    expect(fbA?.textContent).toContain('caught(A): Error: boom-A')

    unmount()
  })
})
