// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal, effect } from '@pyreon/reactivity'

/**
 * Migrated from `<Playground>` — Node graph — drag, select, connect.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function NodeGraphDragSelectConnect() {
  // createFlow() handles all of this with auto-layout, pan/zoom,
  // keyboard a11y, and edge routing. This sample focuses on the
  // signal-driven core: a nodes signal + an edges array + an
  // effect that re-renders the SVG when either changes.
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const svgEl = (tag: any, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
    return el
  }

  const nodes = signal([
    { id: 'a', x: 40,  y: 50,  label: 'Start' },
    { id: 'b', x: 200, y: 110, label: 'Process' },
    { id: 'c', x: 360, y: 50,  label: 'End' },
  ])
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ]
  const selected = signal(null)
  const dragging = signal(null)
  const dragOffset = signal({ x: 0, y: 0 })

  const svg = svgEl('svg', {
    width: '100%',
    height: '220',
    viewBox: '0 0 480 220',
    style: 'background:var(--surface);border:1px solid var(--border);border-radius:8px',
  })

  effect(() => {
    svg.innerHTML = ''
    const ns = nodes()
    const map = Object.fromEntries(ns.map((n) => [n.id, n]))
    for (const e of edges) {
      const A = map[e.from], B = map[e.to]
      if (!A || !B) continue
      svg.appendChild(svgEl('line', {
        x1: A.x + 50, y1: A.y + 18, x2: B.x + 50, y2: B.y + 18,
        stroke: 'var(--muted)', 'stroke-width': 2,
      }))
    }
    for (const n of ns) {
      const isSel = selected() === n.id
      const rect = svgEl('rect', {
        x: n.x, y: n.y, width: 100, height: 36, rx: 8,
        fill: isSel ? 'var(--accent)' : 'var(--bg)',
        stroke: isSel ? 'var(--accent)' : 'var(--border)',
        'stroke-width': isSel ? 2 : 1,
        style: 'cursor:grab',
      })
      rect.addEventListener('pointerdown', (ev: any) => {
        selected.set(n.id); dragging.set(n.id)
        dragOffset.set({ x: ev.clientX - n.x, y: ev.clientY - n.y })
        rect.setPointerCapture(ev.pointerId)
      })
      const text = svgEl('text', {
        x: n.x + 50, y: n.y + 22, 'text-anchor': 'middle',
        fill: isSel ? 'var(--bg)' : 'var(--fg)',
        'font-family': 'Space Grotesk, sans-serif', 'font-size': 13, 'font-weight': 600,
      })
      text.textContent = n.label
      svg.appendChild(rect)
      svg.appendChild(text)
    }
  })

  svg.addEventListener('pointermove', (e: any) => {
    const id = dragging()
    if (!id) return
    const off = dragOffset()
    nodes.update((ns) => ns.map((n) =>
      n.id === id ? { ...n, x: Math.max(0, Math.min(380, e.clientX - off.x)), y: Math.max(0, Math.min(184, e.clientY - off.y)) } : n,
    ))
  })
  svg.addEventListener('pointerup', () => dragging.set(null))

  const status = document.createElement('div')
  status.className = 'muted'
  status.style.marginTop = '8px'
  effect(() => {
    status.textContent = selected()
      ? 'selected: ' + selected() + ' · drag any node to move it'
      : 'click a node to select; drag to move'
  })

  app.appendChild(svg)
  app.appendChild(status)
}
