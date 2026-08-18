#!/usr/bin/env bun
/**
 * DIAGNOSTIC: is the hydration gap in the JS walk, or in the forced layout the
 * timed region flushes afterwards?
 *
 * `bench-hydration.ts` times `hydrate()` PLUS a
 * `container.getBoundingClientRect()` layout flush. A CPU profile rooted at
 * `hydrate()` shows Pyreon and Vue within noise of each other, so this probes
 * the OTHER half with raw DOM only — no framework code, no bundler.
 *
 * Arms (each: fresh innerHTML, then a timed forced layout):
 *   parse      — cost of `innerHTML = fixture` itself (untimed in the bench,
 *                but it sizes the DOM the layout then walks)
 *   layout     — `getBoundingClientRect()` over the freshly-parsed fixture
 *   mutate     — remove the N `<!--$-->` open markers Pyreon's hydration
 *                removes, THEN force layout (Pyreon-shaped arm only)
 *
 * If `layout` is equal across frameworks but Pyreon's `mutate` arm is dearer,
 * the gap is structural-mutation-invalidated relayout, not walk speed.
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4186
const REPS = Number(process.env.REPS ?? 40)

const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
})
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.launch()
const page = await browser.newPage()
// Navigate to the benchmark origin so COOP/COEP apply → 5µs clock quantum.
await page.goto(`http://localhost:${PORT}/`)

const isolated = await page.evaluate(() => globalThis.crossOriginIsolated === true)
const quantum = await page.evaluate(() => {
  // Smallest observable non-zero performance.now() delta.
  let min = Infinity
  for (let i = 0; i < 200_000; i++) {
    const a = performance.now()
    const b = performance.now()
    if (b > a && b - a < min) min = b - a
  }
  return min * 1000 // µs
})
console.warn(`crossOriginIsolated=${isolated}  clock quantum≈${quantum.toFixed(1)}µs`)
if (!isolated) throw new Error('[probe] page is NOT crossOriginIsolated — clock is 100µs-clamped')

const out = await page.evaluate(async (reps: number) => {
  const fx = (await fetch('/hydration-fixtures.json').then((r) => r.json())) as {
    html: Record<string, string>
  }
  const host = document.createElement('div')
  document.body.appendChild(host)

  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
  }

  const countNodes = (root: Node) => {
    let els = 0
    let comments = 0
    let texts = 0
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
    while (w.nextNode()) {
      const t = w.currentNode.nodeType
      if (t === 1) els++
      else if (t === 8) comments++
      else if (t === 3) texts++
    }
    return { els, comments, texts, total: els + comments + texts }
  }

  const res: Record<string, unknown> = {}

  for (const name of ['pyreon', 'vue', 'react']) {
    const html = fx.html[name]
    if (!html) continue
    const parse: number[] = []
    const layout: number[] = []
    const mutate: number[] = []
    const mutateOnly: number[] = []

    for (let i = 0; i < reps; i++) {
      // ---- parse arm
      host.innerHTML = ''
      host.getBoundingClientRect()
      let t0 = performance.now()
      host.innerHTML = html
      parse.push(performance.now() - t0)

      // ---- layout arm (fresh parse, untouched DOM)
      t0 = performance.now()
      host.getBoundingClientRect()
      layout.push(performance.now() - t0)

      // ---- mutate arm: strip `<!--$-->` open markers (what Pyreon's
      //      replayAdoptPlan does, one removeChild per row), then force layout.
      host.innerHTML = html
      host.getBoundingClientRect() // settle
      const opens: Comment[] = []
      const w = document.createTreeWalker(host, NodeFilter.SHOW_COMMENT)
      while (w.nextNode()) {
        if ((w.currentNode as Comment).data === '$') opens.push(w.currentNode as Comment)
      }
      t0 = performance.now()
      for (const c of opens) c.remove()
      mutateOnly.push(performance.now() - t0)
      t0 = performance.now()
      host.getBoundingClientRect()
      mutate.push(performance.now() - t0)
    }

    host.innerHTML = html
    res[name] = {
      nodes: countNodes(host),
      bytes: html.length,
      parseMs: med(parse),
      layoutMs: med(layout),
      mutateOnlyMs: med(mutateOnly),
      layoutAfterMutateMs: med(mutate),
    }
  }
  host.remove()
  return res
}, REPS)

await browser.close()
preview.kill()

console.warn(`\n=== raw-DOM probe (median of ${REPS}) ===\n`)
for (const [name, d0] of Object.entries(out)) {
  const d = d0 as {
    nodes: { els: number; comments: number; texts: number; total: number }
    bytes: number
    parseMs: number
    layoutMs: number
    mutateOnlyMs: number
    layoutAfterMutateMs: number
  }
  console.warn(`${name}:`)
  console.warn(
    `  DOM            ${d.nodes.total} nodes (${d.nodes.els} el / ${d.nodes.comments} comment / ${d.nodes.texts} text), ${(d.bytes / 1024).toFixed(1)}KB`,
  )
  console.warn(`  innerHTML parse      ${d.parseMs.toFixed(3)}ms   (untimed in the bench)`)
  console.warn(`  forced layout        ${d.layoutMs.toFixed(3)}ms   (IN the timed region)`)
  console.warn(`  strip $-open markers ${d.mutateOnlyMs.toFixed(3)}ms`)
  console.warn(`  layout after strip   ${d.layoutAfterMutateMs.toFixed(3)}ms\n`)
}
