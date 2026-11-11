// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

// #4305 — the Node half of the `layout()` contract (the animated half runs in
// real Chromium: `layout-await.browser.test.ts`).
//
// 1. With no requestAnimationFrame (SSR / Node), the animated default must not
//    leave a promise that never settles and positions that never move: it
//    applies the final layout at once.
// 2. A layout whose ELK computation finishes AFTER a later layout() was
//    started must not overwrite the newer result (a slow stale promise
//    overwriting a newer one — leak class F).

type Pos = { id: string; position: { x: number; y: number } }
const pending: Array<{ resolve: (p: Pos[]) => void; tag: number }> = []

vi.mock('../layout', () => ({
  computeLayout: (nodes: { id: string }[], _e: unknown, _a: unknown, opts: { tag?: number }) =>
    new Promise<Pos[]>((resolve) => {
      if (opts.tag === undefined) {
        resolve(nodes.map((n, i) => ({ id: n.id, position: { x: i * 100, y: 0 } })))
      } else {
        pending.push({ resolve, tag: opts.tag })
      }
    }),
}))

const { createFlow } = await import('../flow')

const graph = () => ({
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, data: {} },
    { id: 'b', position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [],
})
const xs = (f: { nodes: () => { position: { x: number } }[] }) => f.nodes().map((n) => n.position.x)

afterEach(() => {
  pending.length = 0
})

describe('layout() settles with the layout applied', () => {
  it('without requestAnimationFrame, the default (animated) layout applies at once', async () => {
    expect(typeof requestAnimationFrame).toBe('undefined')
    const flow = createFlow(graph())
    await flow.layout('layered')
    expect(xs(flow)).toEqual([0, 100])
    flow.dispose()
  })

  it('a stale computation that finishes last does not overwrite the newer layout', async () => {
    const flow = createFlow(graph())
    const older = flow.layout('layered', { tag: 1 } as never)
    const newer = flow.layout('layered', { tag: 2 } as never)
    const byTag = (t: number) => pending.find((p) => p.tag === t)!
    byTag(2).resolve([
      { id: 'a', position: { x: 10, y: 0 } },
      { id: 'b', position: { x: 20, y: 0 } },
    ])
    await newer
    byTag(1).resolve([
      { id: 'a', position: { x: 999, y: 0 } },
      { id: 'b', position: { x: 999, y: 0 } },
    ])
    await older
    expect(xs(flow)).toEqual([10, 20])
    flow.dispose()
  })
})
