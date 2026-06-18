/**
 * Coverage-focused tests for small node-side gaps.
 *
 * Targets:
 * - Portal SSR branch (`typeof document === 'undefined'` → null) — line 34
 * - Text styled.ts extraStyles branch variants — 1 uncov stmt
 * - Element equalize() rows/height + ResizeObserver-callback paths
 * - Element needsFix simple-element children getter
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Element } from '../Element'
import { Portal } from '../Portal'

type ROStub = {
  observed: HTMLElement[]
  disconnects: number
  callbacks: Array<() => void>
}

// Install a ResizeObserver stub that captures the equalize callback so we
// can fire it manually and exercise equalize() AFTER a DOM mutation.
function installResizeObserverStub(): ROStub {
  const stub: ROStub = { observed: [], disconnects: 0, callbacks: [] }
  class StubResizeObserver {
    callback: () => void
    constructor(callback: () => void) {
      this.callback = callback
      stub.callbacks.push(callback)
    }
    observe(node: HTMLElement) {
      stub.observed.push(node)
    }
    disconnect() {
      stub.disconnects++
    }
    unobserve() {
      /* no-op */
    }
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver
  return stub
}

function uninstallResizeObserverStub(prev: unknown) {
  if (prev === undefined)
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver
  else (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = prev
}

describe('Portal SSR branch', () => {
  const originalDocument = globalThis.document

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
      writable: true,
    })
  })

  it('returns null when document is undefined (line 34 SSR branch)', () => {
    Object.defineProperty(globalThis, 'document', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    // Portal is a PyreonComponent — calling it directly returns its render
    // output. In SSR mode (document undefined) it bails to null.
    const result = (Portal as unknown as (props: { children?: unknown }) => unknown)({
      children: null,
    })
    expect(result).toBeNull()
  })
})

describe('Element equalize() paths', () => {
  it('equalizes by HEIGHT when direction is "rows" (mount + RO callback)', () => {
    const prev = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver
    const stub = installResizeObserverStub()
    try {
      const root = document.createElement('div')
      document.body.appendChild(root)

      // direction:'rows' drives equalize() down the `type==='height'` arm
      // (line 31#0 / 32#0). The wrapper has 3 distinct element children, so
      // `beforeEl && afterEl && beforeEl !== afterEl` is TRUE (line 30#0) and
      // both happy-dom offset metrics are integer 0 (line 36#0).
      const unmount = mount(
        h(Element, {
          equalBeforeAfter: true,
          direction: 'rows',
          beforeContent: h('span', null, 'Before'),
          afterContent: h('span', null, 'After'),
          children: 'Main',
        }),
        root,
      )

      // The initial onMount equalize ran during mount. Fire the captured
      // ResizeObserver callback to exercise the observer-callback closure
      // (the `() => equalize(node, own.direction)` arrow).
      expect(stub.callbacks.length).toBe(1)
      stub.callbacks[0]!()

      // After mounting, the wrapper node's two equalized children should
      // carry an explicit height (maxSize) set by equalize on the rows path.
      const wrapper = root.firstElementChild as HTMLElement
      const first = wrapper.firstElementChild as HTMLElement
      const last = wrapper.lastElementChild as HTMLElement
      expect(first).not.toBe(last)
      expect(first.style.height).toBe('0px')
      expect(last.style.height).toBe('0px')

      unmount()
      root.remove()
    } finally {
      uninstallResizeObserverStub(prev)
    }
  })

  it('skips equalization when a slot child is missing or non-integer (RO callback after mutation)', () => {
    const prev = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver
    const stub = installResizeObserverStub()
    try {
      const root = document.createElement('div')
      document.body.appendChild(root)

      const unmount = mount(
        h(Element, {
          equalBeforeAfter: true,
          beforeContent: h('span', null, 'Before'),
          afterContent: h('span', null, 'After'),
          children: 'Main',
        }),
        root,
      )

      const wrapper = root.firstElementChild as HTMLElement

      // (a) Mutate so only ONE element child remains → equalize's
      //     `beforeEl && afterEl && beforeEl !== afterEl` is FALSE (line 30#1).
      while (wrapper.children.length > 1) wrapper.lastElementChild!.remove()
      stub.callbacks[0]!()

      // (b) Restore two distinct children, but force a NON-integer offset so
      //     `Number.isInteger(beforeSize) && Number.isInteger(afterSize)` is
      //     FALSE (line 36#1) — equalize bails before writing styles.
      const a = document.createElement('span')
      const b = document.createElement('span')
      Object.defineProperty(a, 'offsetWidth', { configurable: true, value: 10.5 })
      Object.defineProperty(b, 'offsetWidth', { configurable: true, value: 20.5 })
      wrapper.innerHTML = ''
      wrapper.appendChild(a)
      wrapper.appendChild(b)
      stub.callbacks[0]!()
      // Non-integer metrics → no width written.
      expect(a.style.width).toBe('')
      expect(b.style.width).toBe('')

      unmount()
      root.remove()
    } finally {
      uninstallResizeObserverStub(prev)
    }
  })
})

describe('Element simple-element falsy content-align guards', () => {
  // In the isSimpleElement path, wrapper direction/alignX/alignY are only
  // overridden when the resolved content value is truthy
  // (`if (contentDirection) ...` etc., lines 120-122). A consumer passing an
  // empty string keeps the `?? default` from kicking in (`'' ?? x` === ''),
  // so the value stays falsy and the override is skipped — exercising the
  // FALSE side of each guard. The wrapper then keeps own.direction
  // (undefined) / the alignX/alignY defaults.
  it('skips the direction override when contentDirection resolves falsy', () => {
    const result = Element({ contentDirection: '' as never, children: 'x' }) as {
      props: Record<string, unknown>
    }
    // own.direction is undefined and the override was skipped → no `rows`.
    expect(result.props.as).toBeUndefined()
    expect((result.props.$element as { direction?: unknown }).direction).toBeUndefined()
  })

  it('skips alignX/alignY overrides when they resolve falsy', () => {
    const result = Element({
      contentAlignX: '' as never,
      contentAlignY: '' as never,
      children: 'x',
    }) as { props: Record<string, unknown> }
    const el = result.props.$element as { alignX?: unknown; alignY?: unknown }
    // Defaults (left/center) survive because the empty-string overrides were
    // skipped by the falsy guards.
    expect(el.alignX).toBe('left')
    expect(el.alignY).toBe('center')
  })
})

describe('Element needsFix simple-element children getter', () => {
  it('mounts a <button> Element (needsFix path) and renders its children', () => {
    // A `button` tag is in INLINE_ELEMENTS_FLEX_FIX → isWebFixNeeded true →
    // the `isSimpleElement && needsFix` branch returns h(Wrapper, { children:
    // () => resolveSlot(getChildren()) }). Mounting INVOKES that children
    // getter (anonymous fn) — calling Element() directly never would.
    const root = document.createElement('div')
    document.body.appendChild(root)
    const unmount = mount(h(Element, { tag: 'button', children: 'Click me' }), root)
    const btn = root.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn!.textContent).toContain('Click me')
    unmount()
    root.remove()
  })
})
