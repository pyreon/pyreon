// The entrance crosses every family: each host whose engine takes a
// `progress` declares `animates: true` and hands the tween's progress to its
// render — the same number `PyreonChartEntrance` hands the native emit. Two
// locks: a behavioural one (the treemap's cells grow across the tween's
// frames and settle at full size) and a totality one over the host sources,
// so a family added later cannot ship the prop inert on the web again — that
// is exactly how `animate` sat unwired on fourteen hosts until 0.52.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { TreemapChart } from './TreemapChart'
import type { TreeNode } from './treemap'

const frames: number[][] = []
let queue: FrameRequestCallback[] = []

beforeAll(() => {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => {
      if (k === 'measureText') return (text: string) => ({ width: text.length * 6 })
      if (k === 'clearRect') return () => frames.push([])
      if (k === 'fillRect') return (_x: number, _y: number, w: number) => frames[frames.length - 1]?.push(w)
      return k in t ? t[k] : () => undefined
    },
    set: (t, k, v) => {
      t[k] = v
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext']
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => queue.push(cb)
})

const DATA: TreeNode[] = [{ name: 'a', value: 3 }, { name: 'b', value: 1 }]
const widest = (f: number[] | undefined): number => Math.max(0, ...(f ?? []))

describe('the family hosts play the entrance', () => {
  it('a treemap grows its cells across the tween and settles at full size; animate={false} paints full size at once', () => {
    frames.length = 0
    queue = []
    const root = document.createElement('div')
    document.body.appendChild(root)
    const dispose = mount(h(TreemapChart, { data: DATA, width: 200, height: 100, accessibleTable: false }), root)
    expect(queue.length).toBe(1)
    // Drive the tween by hand: the host's tick reads `now` from the frame.
    const tick = (now: number): void => {
      const cbs = queue
      queue = []
      for (const cb of cbs) cb(now)
    }
    tick(0)
    const start = frames.length
    tick(350)
    const mid = widest(frames[frames.length - 1])
    tick(700)
    const done = widest(frames[frames.length - 1])
    expect(frames.length).toBeGreaterThan(start)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(done)
    // Cubic ease-out at t = 0.5 is 0.875 of the full width.
    expect(mid / done).toBeCloseTo(0.875, 2)
    expect(queue.length).toBe(0)
    dispose()
    root.remove()

    frames.length = 0
    const off = document.createElement('div')
    document.body.appendChild(off)
    const disposeOff = mount(h(TreemapChart, { data: DATA, width: 200, height: 100, accessibleTable: false, animate: false }), off)
    expect(queue.length).toBe(0)
    expect(widest(frames[frames.length - 1])).toBe(done)
    disposeOff()
    off.remove()
  })

  it('every canvas-host family whose engine takes a progress declares animates and passes the tween to its render', () => {
    const dir = import.meta.dirname
    const engine = new Map<string, string>()
    for (const f of readdirSync(dir)) if (f.endsWith('.ts') && !f.includes('.test.')) engine.set(f.slice(0, -3), readFileSync(join(dir, f), 'utf8'))
    const seen: string[] = []
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('Chart.tsx')) continue
      const src = readFileSync(join(dir, f), 'utf8')
      if (!src.includes('canvasHost<')) continue
      // OptionChart's cartesian surface rides the shared host too, but its
      // render is a PRECOMPILED command list (`compiledCommands`, the same one
      // `optionToSvg` serialises) with no progress parameter — the option
      // facade draws fully formed on every target, so it declares no entrance.
      if (f === 'OptionChart.tsx') {
        expect(src.includes('animate: false')).toBe(true)
        continue
      }
      // The render function the host calls, and the module that exports it.
      const call = /render: \([^)]*\) =>[\s\S]*?\b(render[A-Z][A-Za-z]*)\(/.exec(src)
      expect(call, f).not.toBeNull()
      const fn = call![1]!
      const mod = [...engine.entries()].find(([, text]) => new RegExp(`export function ${fn}\\(`).test(text))
      expect(mod, `${f}: ${fn}`).toBeDefined()
      const takesProgress = /progress\?: Double/.test(mod![1])
      expect(src.includes('animates: true'), `${f} (${fn} in ${mod![0]}.ts takes a progress: ${takesProgress})`).toBe(takesProgress)
      if (takesProgress) {
        expect(/render: \([^)]*\bprogress\)/.test(src), `${f}: render must receive progress`).toBe(true)
        expect(/[,{ ]progress\b[ }),]/.test(src.slice(src.indexOf('render: ('))), `${f}: render must pass progress on`).toBe(true)
        seen.push(f)
      }
    }
    // A backstop over the per-family assertions above, not a substitute for
    // them: every family in `seen` has already proved it declares `animates`
    // AND threads `progress` through, so this only catches a scan that found
    // nothing. Bump it when a family lands — chord took it from 14 to 15.
    expect(seen.length).toBe(15)
  })
})
