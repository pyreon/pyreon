/**
 * REPRODUCTION + REGRESSION: the `_errorBoundaryStack.pop()` cleanup is
 * position-based — same bug class as the `popContext()` bug fixed in #725.
 *
 * Scenario: two or more sibling `<ErrorBoundary>` boundaries. When a NON-LAST
 * boundary unmounts (keyed `<For>` removing the first item, `<Show>` flipping
 * the first of several siblings, route nav unmounting the outer of nested
 * routes, etc.), its `onUnmount` calls `popErrorBoundary()` → `stack.pop()`
 * → pops the LAST (innermost) boundary's handler — the wrong one.
 *
 * Outcome:
 *   - Subsequent errors in the SURVIVING boundary's children route to whatever
 *     handler is now at `stack[length-1]`, which is the stale handler of an
 *     ALREADY-UNMOUNTED boundary. Calling `error.set(err)` on that handler's
 *     captured signal is a no-op → the error is silently swallowed AND the
 *     surviving boundary's fallback never renders.
 *
 * Fix (#725-class): `popErrorBoundary(handler)` uses `lastIndexOf + splice`
 * to remove by IDENTITY. Each ErrorBoundary's `onUnmount` passes its own
 * handler reference, so unmount in any order correctly removes the right
 * handler.
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
