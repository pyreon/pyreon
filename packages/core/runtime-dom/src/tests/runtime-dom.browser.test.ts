import { For, h, Portal } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hydrateRoot, mount, Transition } from '../index'

// Real-Chromium smoke suite for @pyreon/runtime-dom. Catches environment-
// divergence bugs that happy-dom hides: SVG namespace property setters,
// real PointerEvent sequencing, `import.meta.env.DEV` literal-replacement,
// and the keyed reconciler under live signal updates.

describe('runtime-dom in real browser', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts and patches DOM when a signal updates', async () => {
    const count = signal(0)
    const { container, unmount } = mountInBrowser(
      h('span', { id: 'n' }, () => String(count())),
    )
    expect(container.querySelector('#n')?.textContent).toBe('0')

    count.set(42)
    await flush()
    expect(container.querySelector('#n')?.textContent).toBe('42')
    unmount()
  })

  it('keyed <For> reconciler inserts at the right index when a list grows', async () => {
    type Row = { id: number; label: string }
    const rows = signal<Row[]>([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ])
    const { container, unmount } = mountInBrowser(
      h(
        'ul',
        { id: 'list' },
        For({
          each: rows,
          by: (r: Row) => r.id,
          children: (r: Row) => h('li', { 'data-id': String(r.id) }, r.label),
        }),
      ),
    )

    let items = container.querySelectorAll<HTMLLIElement>('#list li')
    expect(items).toHaveLength(2)
    expect(Array.from(items).map((el) => el.textContent)).toEqual(['a', 'b'])

    rows.set([
      { id: 1, label: 'a' },
      { id: 3, label: 'c' },
      { id: 2, label: 'b' },
    ])
    await flush()

    items = container.querySelectorAll<HTMLLIElement>('#list li')
    expect(items).toHaveLength(3)
    expect(Array.from(items).map((el) => el.dataset.id)).toEqual(['1', '3', '2'])
    expect(Array.from(items).map((el) => el.textContent)).toEqual(['a', 'c', 'b'])
    unmount()
  })

  it('creates SVG with the SVG namespace and updates reactive attributes via setAttribute', async () => {
    const x = signal(10)
    const { container, unmount } = mountInBrowser(
      h(
        'svg',
        { id: 'svg', width: '100', height: '100' },
        h('rect', { id: 'r', x: () => x(), y: '0', width: '20', height: '20' }),
      ),
    )

    const svg = container.querySelector('#svg')
    const rect = container.querySelector('#r')
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(rect?.namespaceURI).toBe('http://www.w3.org/2000/svg')
    // SVGRectElement.x is a read-only SVGAnimatedLength getter — applying
    // via property would crash. setAttribute is the only safe path.
    expect(rect?.getAttribute('x')).toBe('10')

    x.set(55)
    await flush()
    expect(rect?.getAttribute('x')).toBe('55')
    unmount()
  })

  it('dispatches a real PointerEvent and fires the onClick handler', async () => {
    const clicks = signal(0)
    const { container, unmount } = mountInBrowser(
      h(
        'button',
        {
          id: 'btn',
          onClick: () => clicks.set(clicks() + 1),
        },
        () => `clicks: ${clicks()}`,
      ),
    )

    const btn = container.querySelector<HTMLButtonElement>('#btn')!
    expect(btn.textContent).toBe('clicks: 0')

    btn.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }),
    )
    btn.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }),
    )
    btn.click()
    await flush()
    expect(btn.textContent).toBe('clicks: 1')
    unmount()
  })

  it('emits the duplicate-key __DEV__ warning under Vite (DEV=true)', async () => {
    // import.meta.env.DEV is true in this dev-mode browser run, which is the
    // exact replacement Vite/Rolldown apply at build-time. The warning must
    // fire here. The companion `runtime-dom.prod-bundle.test.ts` Node test
    // proves the same code path is dead in a prod bundle (DEV=false).
    expect(import.meta.env.DEV).toBe(true)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dupes = signal([
      { id: 1, label: 'a' },
      { id: 1, label: 'b' },
    ])
    const { unmount } = mountInBrowser(
      h(
        'div',
        null,
        For({
          each: dupes,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h('span', { class: 'dup' }, r.label),
        }),
      ),
    )
    await flush()

    const calls = warn.mock.calls.flat().join('\n')
    expect(calls).toMatch(/Duplicate key/i)
    unmount()
  })

  it('hydrateRoot — attaches reactive listeners to existing SSR markup without rerender', async () => {
    // Simulate SSR-rendered HTML in the container.
    const container = document.createElement('div')
    container.innerHTML = '<button id="ssr-btn" type="button">clicks: 0</button>'
    document.body.appendChild(container)

    const ssrButtonRef = container.querySelector<HTMLButtonElement>('#ssr-btn')!
    const count = signal(0)
    const cleanup = hydrateRoot(
      container,
      h(
        'button',
        {
          id: 'ssr-btn',
          type: 'button',
          onClick: () => count.set(count() + 1),
        },
        () => `clicks: ${count()}`,
      ),
    )

    // Same DOM node — hydrate adopts it, doesn't replace.
    expect(container.querySelector('#ssr-btn')).toBe(ssrButtonRef)

    // Click triggers the hydrated handler + reactive text update.
    ssrButtonRef.click()
    await flush()
    expect(ssrButtonRef.textContent).toBe('clicks: 1')

    cleanup()
    container.remove()
  })

  it('Portal — children render in a different DOM subtree (not the wrapper)', async () => {
    const target = document.createElement('div')
    target.id = 'portal-target'
    document.body.appendChild(target)

    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'src' },
        h(Portal, { target }, h('span', { id: 'teleported' }, 'over there')),
      ),
    )

    // Portal child is in target, NOT in container.
    expect(container.querySelector('#teleported')).toBeNull()
    expect(target.querySelector('#teleported')?.textContent).toBe('over there')
    unmount()
    target.remove()
  })

  it('Transition — show=false applies leave classes; transitionend removes element', async () => {
    const visible = signal(true)
    const { container, unmount } = mountInBrowser(
      h(
        Transition,
        { name: 'fade', show: () => visible() },
        // Real CSS transition so transitionend actually fires when the
        // class swap changes opacity (not just instantly).
        h('div', { id: 'fading', style: 'transition: opacity 30ms; opacity: 1' }, 'hello'),
      ),
    )
    await flush()
    expect(container.querySelector('#fading')).not.toBeNull()

    visible.set(false)
    // After two rAFs the leave-active + leave-to classes are applied.
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    const stillRendered = container.querySelector('#fading')
    if (stillRendered) {
      // Expect at least one of the fade-leave classes during the
      // active phase.
      expect(stillRendered.className).toMatch(/fade-leave/)
      // Manually fire transitionend to short-circuit the 5s safety
      // timeout (we don't care about real timing here, only that the
      // event-driven cleanup path works).
      stillRendered.dispatchEvent(new Event('transitionend', { bubbles: true }))
    }
    await flush()
    await new Promise<void>((r) => setTimeout(r, 16))
    expect(container.querySelector('#fading')).toBeNull()
    unmount()
  })

  it('two mount() roots stay isolated — events on one do not affect the other', async () => {
    const c1 = signal(0)
    const c2 = signal(0)
    const root1 = document.createElement('div')
    const root2 = document.createElement('div')
    document.body.append(root1, root2)

    const u1 = mount(
      h('button', { id: 'b1', onClick: () => c1.set(c1() + 1) }, () => `c1=${c1()}`),
      root1,
    )
    const u2 = mount(
      h('button', { id: 'b2', onClick: () => c2.set(c2() + 1) }, () => `c2=${c2()}`),
      root2,
    )

    root1.querySelector<HTMLButtonElement>('#b1')!.click()
    root1.querySelector<HTMLButtonElement>('#b1')!.click()
    root2.querySelector<HTMLButtonElement>('#b2')!.click()
    await flush()

    expect(c1()).toBe(2)
    expect(c2()).toBe(1)

    u1()
    u2()
    root1.remove()
    root2.remove()
  })

  it('event delegation — multi-word event names like onPointerDown actually fire', async () => {
    // Regression for the bug fixed alongside this PR:
    // `onPointerDown` was being lowercased to `pointerDown` for the
    // DELEGATED_EVENTS lookup, missing the all-lowercase entry, so the
    // handler was attached via addEventListener('pointerDown', ...) which
    // never fires. Same for mousedown, dblclick, touchstart, etc.
    let pointerDownFired = 0
    let dblClickFired = 0
    const { container, unmount } = mountInBrowser(
      h('div', {
        id: 'evt',
        onPointerDown: () => {
          pointerDownFired++
        },
        onDblClick: () => {
          dblClickFired++
        },
      }),
    )
    const target = container.querySelector('#evt')!
    target.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }),
    )
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await flush()
    expect(pointerDownFired).toBe(1)
    expect(dblClickFired).toBe(1)
    unmount()
  })
})
