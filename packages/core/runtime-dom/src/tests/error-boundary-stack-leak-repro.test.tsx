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
 *     captured signal is a no-op (the boundary's reactive effect was disposed)
 *     → the error is silently swallowed AND the surviving boundary's fallback
 *     never renders.
 *   - The stale handler's closure (referencing the unmounted boundary's
 *     `signal` + `reset` + downstream UI) leaks for as long as any sibling
 *     ErrorBoundary remains mounted.
 *
 * Fix (#725-class): `popErrorBoundary(handler)` uses `lastIndexOf + splice`
 * to remove by IDENTITY. Each ErrorBoundary's `onUnmount` passes its own
 * handler reference, so unmount in any order correctly removes the right
 * handler.
 */
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
    // Suppress the dev "throw during render" console.error from the
    // throwing-child path. Tests want clean output even when the runtime
    // legitimately logs the caught throw.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    container.remove()
    errorSpy.mockRestore()
  })

  it('REGRESSION: surviving sibling boundary still catches errors after a sibling unmounts (FIRST unmounted)', () => {
    // Two sibling boundaries. Each has a `<Show>` that lazily mounts a
    // throw-on-mount component when a signal flips true. The `<Show>`
    // triggers a fresh `mountComponent` call → fresh `dispatchToErrorBoundary`
    // → routes to whichever handler is currently at the top of the stack.
    const showA = signal(false)
    const showB = signal(false)
    const aliveA = signal(true)

    function Bomb({ name }: { name: string }) {
      throw new Error(`boom-${name}`)
    }

    const App = () =>
      h(
        'div',
        null,
        // Boundary A — wrapped in Show so we can UNMOUNT it without
        // touching boundary B.
        h(Show as Parameters<typeof h>[0], {
          when: () => aliveA(),
          children: () =>
            h(
              ErrorBoundary,
              {
                fallback: (err: unknown) =>
                  h('div', { 'data-testid': 'fb-A' }, `caught(A): ${String(err)}`),
              },
              // Lazy throw via Show inside A
              h(Show as Parameters<typeof h>[0], {
                when: () => showA(),
                children: () => h(Bomb, { name: 'A' }),
              }) as unknown as Parameters<typeof h>[1],
            ),
        }),
        // Boundary B — always mounted.
        h(
          ErrorBoundary,
          {
            fallback: (err: unknown) =>
              h('div', { 'data-testid': 'fb-B' }, `caught(B): ${String(err)}`),
          },
          h(Show as Parameters<typeof h>[0], {
            when: () => showB(),
            children: () => h(Bomb, { name: 'B' }),
          }) as unknown as Parameters<typeof h>[1],
        ),
      )

    const unmount = mount(h(App, null), container)

    // Both boundaries mounted, no throws yet.
    expect(container.querySelector('[data-testid="fb-A"]')).toBeNull()
    expect(container.querySelector('[data-testid="fb-B"]')).toBeNull()

    // UNMOUNT boundary A (FIRST sibling). Pre-fix: this calls popErrorBoundary()
    // which pops the LAST frame — B's handler — instead of A's.
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

  it('REGRESSION: surviving FIRST boundary catches errors after a LATER sibling unmounts', () => {
    // Pre-fix this case actually worked (LIFO holds for last-unmount), but
    // we include it as a guard: the fix must not regress the LIFO case.
    const showA = signal(false)
    const aliveB = signal(true)

    function Bomb({ name }: { name: string }) {
      throw new Error(`boom-${name}`)
    }

    const App = () =>
      h(
        'div',
        null,
        h(
          ErrorBoundary,
          {
            fallback: (err: unknown) =>
              h('div', { 'data-testid': 'fb-A' }, `caught(A): ${String(err)}`),
          },
          h(Show as Parameters<typeof h>[0], {
            when: () => showA(),
            children: () => h(Bomb, { name: 'A' }),
          }) as unknown as Parameters<typeof h>[1],
        ),
        h(Show as Parameters<typeof h>[0], {
          when: () => aliveB(),
          children: () =>
            h(
              ErrorBoundary,
              {
                fallback: (err: unknown) =>
                  h('div', { 'data-testid': 'fb-B' }, `caught(B): ${String(err)}`),
              },
              null as unknown as Parameters<typeof h>[1],
            ),
        }),
      )

    const unmount = mount(h(App, null), container)

    // Unmount B — this is the LAST-unmount case which LIFO handles
    // correctly even pre-fix. Verify it still works post-fix.
    aliveB.set(false)

    showA.set(true)
    const fbA = container.querySelector('[data-testid="fb-A"]')
    expect(fbA).toBeTruthy()
    expect(fbA?.textContent).toContain('caught(A): Error: boom-A')

    unmount()
  })
})
