// The hosts survive the round trip they actually ship on: server render, then
// hydrate the SAME markup.
//
// `ssr.test.tsx` proves the server can render a chart; nothing proved the
// client could ADOPT what it rendered. A chart is a plausible place for a
// mismatch — a canvas element, an offscreen table built from the data, a live
// region, and a theme read that differs between a server with no
// `matchMedia` and a browser with one — so the round trip is asserted rather
// than assumed.
import { beforeAll, describe, expect, it } from 'vitest'
import { renderToString } from '@pyreon/runtime-server'
import { h } from '@pyreon/core'
import { disableHydrationWarnings, hydrateRoot, onHydrationMismatch } from '@pyreon/runtime-dom'
import { PlotChart } from './Chart'
import { PieChart } from './PieChart'
import { SankeyChart } from './SankeyChart'
import { band, bars, line } from './marks'

interface Row { m: string; v: number; w: number }
const ROWS: Row[] = [{ m: 'a', v: 3, w: 5 }, { m: 'b', v: 6, w: 2 }]

/** Server-render `node()`, hydrate the same tree over it, report mismatches. */
async function roundTrip(node: () => unknown): Promise<{ mismatches: string[]; canvasKept: boolean; html: string; hydrated: string; el: HTMLElement }> {
  const html = await renderToString(node() as never)
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.innerHTML = html
  const before = el.querySelector('canvas')
  const mismatches: string[] = []
  const off = onHydrationMismatch((info) => mismatches.push(JSON.stringify(info)))
  const cleanup = hydrateRoot(el, node() as never)
  off()
  const after = el.querySelector('canvas')
  // Read the hydrated markup BEFORE tearing the tree down — `cleanup()` empties
  // the container, so a later read would assert against nothing and pass by
  // accident on anything phrased as "does not contain".
  const out = { mismatches, canvasKept: before !== null && before === after, html, hydrated: el.innerHTML, el }
  cleanup()
  return out
}

describe('the round-trip harness can fail', () => {
  // A hydration suite whose listener never fires is indistinguishable from one
  // watching the wrong thing. This hydrates a DIFFERENT tree over the server's
  // markup, so both assertions in the specs below have to be reachable.
  beforeAll(() => disableHydrationWarnings())

  it('reports a mismatch and a replaced canvas when the trees disagree', async () => {
    const server = () => h(() => PlotChart<Row>({ data: ROWS, x: (d) => d.m, marks: [bars<Row>((d) => d.v)], title: 'T', width: 320, height: 180 }), null)
    const html = await renderToString(server() as never)
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.innerHTML = html
    const before = el.querySelector('canvas')
    const seen: string[] = []
    const off = onHydrationMismatch((info) => seen.push(JSON.stringify(info)))
    const cleanup = hydrateRoot(el, h('section', null, h('p', null, 'something else')) as never)
    off()
    expect(seen.length, 'the mismatch listener never fired').toBeGreaterThan(0)
    cleanup()
    el.remove()
    // The canvas-identity half is reachable too — hydrating a chart over
    // markup that never had one reports `canvasKept: false` rather than
    // quietly reading `null === null` as a pass.
    void before
    const r = await (async () => {
      const el2 = document.createElement('div')
      document.body.appendChild(el2)
      el2.innerHTML = '<div>no canvas here</div>'
      const c = el2.querySelector('canvas')
      const cl = hydrateRoot(el2, server() as never)
      const kept = c !== null && c === el2.querySelector('canvas')
      cl()
      el2.remove()
      return kept
    })()
    expect(r, 'canvasKept cannot report false').toBe(false)
  })
})

describe('server render → hydrate', () => {
  beforeAll(() => disableHydrationWarnings())

  it('<PlotChart> hydrates its own markup with no mismatch, keeping the canvas node', async () => {
    const tree = () =>
      h(() =>
        PlotChart<Row>({
          data: ROWS,
          x: (d) => d.m,
          marks: [bars<Row>((d) => d.v), line<Row>((d) => d.w)],
          title: 'T',
          width: 320,
          height: 180,
        }),
      null)
    const r = await roundTrip(tree)
    expect(r.mismatches, 'hydration mismatches').toEqual([])
    // Identity, not markup: a rebuilt canvas loses anything already painted
    // and any handler a host attached to it.
    expect(r.canvasKept, 'the server canvas was replaced, not adopted').toBe(true)
    r.el.remove()
  })

  it('a band hydrates — the two-channel kind, whose a11y table has extra columns', async () => {
    const tree = () =>
      h(() =>
        PlotChart<Row>({
          data: ROWS,
          x: (d) => d.m,
          marks: [band<Row>((d) => d.w, (d) => d.v)],
          title: 'Forecast',
          width: 320,
          height: 180,
        }),
      null)
    const r = await roundTrip(tree)
    expect(r.mismatches).toEqual([])
    expect(r.hydrated).toContain('(upper)')
    r.el.remove()
  })

  it('a family host hydrates too — the shared canvasHost path, not just PlotChart', async () => {
    const tree = () =>
      h(() =>
        PieChart<Row>({ data: ROWS, label: (d) => d.m, value: (d) => d.v, title: 'P', width: 300, height: 200 }),
      null)
    const r = await roundTrip(tree)
    expect(r.mismatches).toEqual([])
    expect(r.canvasKept).toBe(true)
    r.el.remove()
  })

  it('a family host with its own options hydrates', async () => {
    const tree = () =>
      h(() =>
        SankeyChart({
          nodes: [{ name: 'a' }, { name: 'b' }],
          links: [{ source: 'a', target: 'b', value: 5 }],
          title: 'S',
          width: 320,
          height: 200,
        }),
      null)
    const r = await roundTrip(tree)
    expect(r.mismatches).toEqual([])
    r.el.remove()
  })
})
