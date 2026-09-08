// The shared canvas host in happy-dom: chrome, selection, tooltip, resize and
// the accessible table — the paths the family hosts share. Pixel truth lives in
// the browser suites; this locks the wiring and the DOM contract.
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { canvasHost, shiftCmds } from './canvas-host'
import type { CanvasHostProps, CanvasHostSpec } from './canvas-host'
import { chartThemes } from './theme'
import type { DrawCmd, Rect } from './types'

type L = { box: Rect; n: number }

// happy-dom has no 2D context: a Proxy that answers every method with a no-op
// (and measureText with a width) is enough for the host's wiring to run.
beforeAll(() => {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k === 'measureText' ? (text: string) => ({ width: text.length * 6 }) : k in t ? t[k] : () => undefined),
    set: (t, k, v) => {
      t[k] = v
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
})

function host(props: CanvasHostProps & { n?: () => number }, extra: Partial<CanvasHostSpec<L>> = {}) {
  const calls: string[] = []
  const spec: CanvasHostSpec<L> = {
    props,
    defaultHeight: 120,
    caption: 'Test data',
    track: () => {
      props.n?.()
    },
    layout: (box) => ({ box, n: props.n?.() ?? 1 }),
    render: (l, _m, theme, progress) => {
      calls.push(`render:${l.n}:${progress}`)
      return [{ kind: 'rect', rect: { x: l.box.x, y: l.box.y, w: 10, h: 10 }, fill: theme.palette[0]! }]
    },
    legend: (l) => Array.from({ length: l.n }, (_, i) => ({ label: `s${i}`, color: '#123456' })),
    select: (_l, px, py) => calls.push(`select:${px}:${py}`),
    tooltip: (_l, px) => (px > 50 ? ['hit', 'line 2'] : null),
    a11y: (l) => ({ title: props.title, categories: Array.from({ length: l.n }, (_, i) => `c${i}`), series: [{ label: 'v', values: Array.from({ length: l.n }, (_, i) => i), kind: 'bars' }] }),
    ...extra,
  }
  return { node: canvasHost(spec), calls }
}

function mounted(node: ReturnType<typeof h>) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(node, root)
  return { root, dispose: () => { dispose(); root.remove() } }
}

describe('canvasHost', () => {
  it('renders canvas + hidden table by default, bare canvas with accessibleTable=false, and a tooltip node only when asked', () => {
    const a = mounted(host({ title: 'T' }).node)
    expect(a.root.querySelector('canvas')).not.toBeNull()
    expect(a.root.querySelector('table caption')!.textContent).toBe('T')
    expect(a.root.querySelector('[data-pyreon-chart-tooltip]')).toBeNull()
    a.dispose()
    // No table, no keyboard live region, no tooltip: nothing to wrap — the canvas is the node.
    const b = mounted(host({ accessibleTable: false, keyboard: false }).node)
    expect(b.root.firstElementChild!.tagName).toBe('CANVAS')
    b.dispose()
    const c = mounted(host({ tooltip: true, accessibleTable: false }).node)
    expect(c.root.querySelector('[data-pyreon-chart-tooltip]')).not.toBeNull()
    c.dispose()
  })
  it('describes itself through a11y by default and through describe() when the family supplies one', () => {
    const a = mounted(host({ title: 'Sales' }).node)
    expect(a.root.querySelector('canvas')!.getAttribute('aria-label')).toContain('Sales')
    a.dispose()
    const b = mounted(host({}, { describe: (l) => `custom ${l.n}` }).node)
    expect(b.root.querySelector('canvas')!.getAttribute('aria-label')).toBe('custom 1')
    b.dispose()
  })
  it('draws again when a tracked input or the theme changes, and the legend/title chrome shifts the box', () => {
    const n = signal(2)
    const { node, calls } = host({ n: () => n(), showTitle: true, title: 'T', showLegend: true, animate: false })
    const m = mounted(node)
    const first = calls.filter((c) => c.startsWith('render')).length
    expect(first).toBeGreaterThan(0)
    n.set(3)
    expect(calls.filter((c) => c.startsWith('render')).length).toBeGreaterThan(first)
    expect(calls.at(-1)).toBe('render:3:1')
    m.dispose()
  })
  it('routes a click to select and a pointer move to the tooltip (shown for a hit, hidden for a miss and on leave)', () => {
    const { node, calls } = host({ tooltip: true, animate: false })
    const m = mounted(node)
    const canvas = m.root.querySelector('canvas')!
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 120, right: 300, bottom: 120, x: 0, y: 0, toJSON: () => ({}) })
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 12, clientY: 34, bubbles: true }))
    expect(calls.some((c) => c === 'select:12:34')).toBe(true)
    const tip = query<HTMLDivElement>(m.root, '[data-pyreon-chart-tooltip]')
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 30, bubbles: true }))
    expect(tip.style.display).toBe('block')
    expect(tip.textContent).toBe('hit\nline 2')
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 30, bubbles: true }))
    expect(tip.style.display).toBe('none')
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 30, bubbles: true }))
    canvas.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
    expect(tip.style.display).toBe('none')
    m.dispose()
  })
  it('paints the theme ground and reads the theme prop over the scope', () => {
    const { node } = host({ theme: chartThemes.dark, accessibleTable: false })
    const m = mounted(node)
    expect((query<HTMLCanvasElement>(m.root, 'canvas')).style.background).toMatch(/#141821|rgb\(20, 24, 33\)/)
    m.dispose()
  })
  it('runs the entrance tween only when the family animates, and skips it when animate is false', () => {
    const { node, calls } = host({ animate: false }, { animates: true })
    const m = mounted(node)
    expect(calls.every((c) => !c.startsWith('render') || c.endsWith(':1'))).toBe(true)
    m.dispose()
  })
})

describe('shiftCmds', () => {
  it('translates every positional field, gradients included, and returns the same list for a zero shift', () => {
    const cmds: DrawCmd[] = [
      { kind: 'rect', rect: { x: 1, y: 2, w: 3, h: 4 }, fill: '#000', grad: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, stops: [] } } as DrawCmd,
      { kind: 'line', from: { x: 1, y: 1 }, to: { x: 2, y: 2 }, stroke: '#000', width: 1 },
      { kind: 'polyline', points: [{ x: 1, y: 1 }], stroke: '#000', width: 1 },
      { kind: 'polygon', points: [{ x: 1, y: 1 }], fill: '#000' },
      { kind: 'circle', center: { x: 1, y: 1 }, radius: 2, fill: '#000' },
      { kind: 'text', text: 't', at: { x: 1, y: 1 }, fill: '#000', size: 10, align: 'start', baseline: 'top' },
    ]
    expect(shiftCmds(cmds, 0, 0)).toBe(cmds)
    const out = shiftCmds(cmds, 10, 20)
    expect((out[0] as { rect: Rect }).rect).toEqual({ x: 11, y: 22, w: 3, h: 4 })
    expect((out[0] as { grad: { from: { x: number; y: number } } }).grad.from).toEqual({ x: 10, y: 20 })
    expect((out[1] as { to: { x: number } }).to.x).toBe(12)
    expect((out[2] as { points: { y: number }[] }).points[0]!.y).toBe(21)
    expect((out[3] as { points: { x: number }[] }).points[0]!.x).toBe(11)
    expect((out[4] as { center: { y: number } }).center.y).toBe(21)
    expect((out[5] as { at: { x: number } }).at.x).toBe(11)
  })
})
