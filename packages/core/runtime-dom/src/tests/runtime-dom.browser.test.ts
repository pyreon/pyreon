import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
})
