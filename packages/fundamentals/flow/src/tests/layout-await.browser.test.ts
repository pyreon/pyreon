import { describe, expect, it } from 'vitest'
import { createFlow } from '../flow'

// #4305 — `await flow.layout()` resolved before the default animation had
// moved the nodes, so `await flow.layout('layered'); flow.fitView()` fitted
// the PRE-layout positions. Real Chromium: the animation runs on real
// requestAnimationFrame frames, which happy-dom / Node do not drive.
//
// Contract: the promise resolves once the layout is applied and visible —
// after the last animation frame wrote the final positions. A later
// `layout()` (or `dispose()`) supersedes a running one and settles its
// promise; `animate: false` applies at once.

const graph = () => ({
  nodes: [
    { id: 't', position: { x: 0, y: 0 }, data: { label: 'T' } },
    { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
    { id: 'b', position: { x: 0, y: 0 }, data: { label: 'B' } },
  ],
  edges: [
    { id: 'e1', source: 't', target: 'a' },
    { id: 'e2', source: 'a', target: 'b' },
  ],
})

const positions = (flow: { nodes: () => { id: string; position: { x: number; y: number } }[] }) =>
  Object.fromEntries(flow.nodes().map((n) => [n.id, { ...n.position }]))

/** The final layout, computed without animation on a separate instance. */
async function finalPositions(): Promise<Record<string, { x: number; y: number }>> {
  const ref = createFlow(graph())
  await ref.layout('layered', { animate: false })
  const out = positions(ref)
  ref.dispose()
  return out
}

describe('flow.layout() — the promise settles when the layout is visible', () => {
  it('the default (animated) layout has moved every node to its final position on resolve', async () => {
    const expected = await finalPositions()
    expect(new Set(Object.values(expected).map((p) => `${p.x},${p.y}`)).size).toBe(3) // a real layout

    const flow = createFlow(graph())
    const start = performance.now()
    await flow.layout('layered', { animationDuration: 120 })
    const elapsed = performance.now() - start

    expect(positions(flow)).toEqual(expected)
    // It really animated (waited for frames), it did not just jump.
    expect(elapsed).toBeGreaterThanOrEqual(100)
    flow.dispose()
  })

  it('code after the await sees the laid-out graph (the fitView pattern)', async () => {
    const flow = createFlow(graph())
    await flow.layout('layered', { animationDuration: 80 })
    // Every node started at 0,0; after the await they are spread out.
    const distinct = new Set(flow.nodes().map((n) => `${n.position.x},${n.position.y}`))
    expect(distinct.size).toBe(3)
    flow.dispose()
  })

  it('a later layout() supersedes a running one: both promises settle, the later one wins', async () => {
    const expected = await finalPositions()
    const flow = createFlow(graph())
    const first = flow.layout('layered', { animationDuration: 2000 })
    // Let the first one start animating.
    await new Promise((r) => setTimeout(r, 60))
    const second = flow.layout('layered', { animate: false })
    await Promise.all([first, second])
    // Give a cancelled animation a chance to (wrongly) write another frame.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    expect(positions(flow)).toEqual(expected)
    flow.dispose()
  })

  it('dispose() settles a running layout instead of leaving it pending', async () => {
    const flow = createFlow(graph())
    const running = flow.layout('layered', { animationDuration: 5000 })
    await new Promise((r) => setTimeout(r, 50))
    flow.dispose()
    await expect(
      Promise.race([
        running.then(() => 'settled'),
        new Promise((r) => setTimeout(() => r('pending'), 500)),
      ]),
    ).resolves.toBe('settled')
  })
})
