#!/usr/bin/env bun
/**
 * DIAGNOSTIC: per-row cost of Pyreon's `$`-marker normalization during
 * `<For>` hydration adoption, isolated from everything else.
 *
 * `replayAdoptPlan` runs once per row and, per the CPU profile, it plus
 * `elByPath` is ~28% of the hydration walk. This reproduces its exact DOM
 * access pattern against the REAL SSR fixture and times the pieces, so an
 * optimization is chosen from a measurement instead of from the profile's
 * (noisy, inlining-blurred) self-time attribution.
 *
 * Arms, all over the same 1000-row fixture:
 *   nav      — `elByPath` element-hop walk to the triplet parent, per row
 *   verify   — nav + the nodeType/data checks replayAdoptPlan performs
 *   remove   — verify + `open.remove()`  (== today's total per-row cost)
 *   walker   — ONE native TreeWalker(SHOW_COMMENT) over the whole block,
 *              collecting every `$` open marker, then removing them
 *   bindwalk — the ref walk the COMPILED bind performs right afterwards
 *              (firstElementChild/nextElementSibling/firstChild), to show how
 *              much of `nav` is duplicated work
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4185
const REPS = Number(process.env.REPS ?? 30)

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`http://localhost:${PORT}/`)
if (!(await page.evaluate(() => globalThis.crossOriginIsolated === true))) {
  throw new Error('[rowcost] not crossOriginIsolated')
}

const out = await page.evaluate(async (reps: number) => {
  const fx = (await fetch('/hydration-fixtures.json').then((r) => r.json())) as {
    html: Record<string, string>
  }
  const html = fx.html.pyreon!
  const host = document.createElement('div')
  document.body.appendChild(host)
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
  }

  // The compiled row template is <tr><td>·</td><td><a>·</a></td></tr>, so the
  // triplet's parent <a> is at element-path [1,0] from the row root, childIndex 0.
  const PATH = [1, 0]
  const elByPath = (root: Element, path: number[]): Element | null => {
    let el: Element | null = root
    for (let i = 0; i < path.length && el; i++) {
      let c: Element | null = el.firstElementChild
      for (let k = 0; k < (path[i] as number) && c; k++) c = c.nextElementSibling
      el = c
    }
    return el
  }
  const rowRoots = (): Element[] => {
    const rows: Element[] = []
    const tb = host.querySelector('tbody')!
    for (let c = tb.firstElementChild; c; c = c.nextElementSibling) rows.push(c)
    return rows
  }

  const res: Record<string, number> = {}
  const run = (label: string, fn: (rows: Element[]) => void) => {
    const xs: number[] = []
    for (let i = 0; i < reps; i++) {
      host.innerHTML = html
      host.getBoundingClientRect()
      const rows = rowRoots()
      const t0 = performance.now()
      fn(rows)
      xs.push(performance.now() - t0)
    }
    res[label] = med(xs)
  }

  run('nav', (rows) => {
    let sink = 0
    for (let i = 0; i < rows.length; i++) if (elByPath(rows[i]!, PATH)) sink++
    ;(globalThis as { __sink?: number }).__sink = sink
  })

  run('verify', (rows) => {
    let sink = 0
    for (let i = 0; i < rows.length; i++) {
      const parent = elByPath(rows[i]!, PATH)
      if (!parent) continue
      const n = parent.firstChild
      if (!n || n.nodeType !== 8 || (n as Comment).data !== '$') continue
      const a = n.nextSibling
      if (a && a.nodeType === 3) {
        const b = a.nextSibling
        if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') continue
        sink++
      }
    }
    ;(globalThis as { __sink?: number }).__sink = sink
  })

  run('remove (today)', (rows) => {
    for (let i = 0; i < rows.length; i++) {
      const parent = elByPath(rows[i]!, PATH)
      if (!parent) continue
      const n = parent.firstChild
      if (!n || n.nodeType !== 8 || (n as Comment).data !== '$') continue
      const a = n.nextSibling
      if (a && a.nodeType === 3) {
        const b = a.nextSibling
        if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') continue
        ;(n as Comment).remove()
      }
    }
  })

  run('walker bulk', () => {
    const tb = host.querySelector('tbody')!
    const opens: Comment[] = []
    const w = document.createTreeWalker(tb, NodeFilter.SHOW_COMMENT)
    let n = w.nextNode()
    while (n) {
      if ((n as Comment).data === '$') opens.push(n as Comment)
      n = w.nextNode()
    }
    for (let i = 0; i < opens.length; i++) (opens[i] as Comment).remove()
  })

  run('bindwalk (compiled refs)', (rows) => {
    let sink = 0
    for (let i = 0; i < rows.length; i++) {
      const root = rows[i]!
      const e0 = root.firstElementChild!
      const t0 = e0.firstChild
      const e1 = e0.nextElementSibling!
      const e2 = e1.firstElementChild!
      const t1 = e2.firstChild
      if (t0 && t1) sink++
    }
    ;(globalThis as { __sink?: number }).__sink = sink
  })

  host.remove()
  return res
}, REPS)

await browser.close()
preview.kill()

console.warn(`\n=== per-row normalization cost, 1000 rows (median of ${REPS}) ===\n`)
const base = out['remove (today)'] ?? 0
for (const [k, v] of Object.entries(out)) {
  console.warn(
    `  ${k.padEnd(26)} ${v.toFixed(3)}ms   ${(v * 1000).toFixed(0)}ns/row` +
      (k === 'remove (today)' ? '   ← current cost' : ''),
  )
}
const walker = out['walker bulk'] ?? 0
console.warn(
  `\n  bulk-walker vs today: ${(base - walker).toFixed(3)}ms saved` +
    ` (${(((base - walker) / base) * 100).toFixed(0)}% of the normalization)`,
)
