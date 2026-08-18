/**
 * Two questions the timing curve cannot answer on its own:
 *
 *   Q1. How many LIVE `removeChild` calls does one `<For>` clear actually make?
 *       `handleFastClear` runs every entry's cleanup BEFORE its "ONE native
 *       remove-all" (`replaceChildren`), and a top-level element's cleanup ends
 *       in `el.parentNode.removeChild(el)`. If that is what happens, the bulk
 *       call is removing an already-empty parent and the comment describing it
 *       as one remove-all is describing an optimization that never runs.
 *
 *   Q2. Does it matter? Price n individual `removeChild` against one bulk
 *       `replaceChildren` on identical bare DOM, with no framework involved.
 *
 * Counting, not reading, is the point: the answer to Q1 is a property of the
 * shipped build, and the row markup routes through several cleanup shapes
 * (`_elementDepth` gating, prop cleanups, ref cleanups) that are easier to
 * mis-read than to count.
 *
 *   bun run build && bun probe-teardown-removal.ts
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const PORT = 4188
// `--strictPort` so a port already held by another worktree's preview is a
// hard failure rather than a silent drift onto THAT worktree's build; `pipe`
// (not `ignore`) plus an exit check so the failure is visible here.
const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: import.meta.dir,
  stdio: ['ignore', 'ignore', 'pipe'],
})
let previewErr = ''
preview.stderr?.on('data', (d: Buffer) => {
  previewErr += d.toString()
})
await new Promise((r) => setTimeout(r, 2500))
if (preview.exitCode !== null) {
  throw new Error(`vite preview died (port ${PORT} taken?): ${previewErr.trim() || 'no output'}`)
}

type Driver = Record<string, (n?: number) => unknown>
const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[pageerror]', e.message))
  await page.goto(`http://localhost:${PORT}/?profileClear=1`)
  await page.waitForFunction(() => '__clearBench' in globalThis, undefined, { timeout: 30_000 })

  // Same arm verification `bench-teardown-curve.ts` performs, for the same
  // reason: Q2 publishes sub-millisecond medians, and this file previously had
  // none of it. Q1 is an operation COUNT and is robust to all of this — Q2 is
  // not.
  const armInfo = await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
    const url =
      urls.find((u) => u.includes('profile-clear')) ?? urls.find((u) => /assets\/.*\.js$/.test(u))
    if (!url) return null
    const src = await (await fetch(url)).text()
    let q = Infinity
    for (let i = 0; i < 40_000; i++) {
      const a = performance.now()
      const b2 = performance.now()
      if (b2 > a) q = Math.min(q, b2 - a)
    }
    return {
      url,
      unminified: src.includes('__clearOnly') || src.includes('function __createOnly'),
      sha: [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src)))]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16),
      isolated: crossOriginIsolated,
      quantumMs: q,
    }
  })
  if (!armInfo) throw new Error('could not locate the page module — cannot verify the arm')
  if (armInfo.unminified) throw new Error('UNMINIFIED build — rebuild with `bun run build`')
  const assetName = decodeURIComponent(new URL(armInfo.url).pathname.split('/').pop()!)
  const distAssets = join(import.meta.dir, 'dist', 'assets')
  if (!readdirSync(distAssets).includes(assetName)) {
    throw new Error(`page loaded ${assetName}, which is NOT in ${distAssets}`)
  }
  const diskSha = createHash('sha256')
    .update(readFileSync(join(distAssets, assetName)))
    .digest('hex')
    .slice(0, 16)
  if (diskSha !== armInfo.sha) {
    throw new Error(`module hash mismatch: page=${armInfo.sha} disk=${diskSha} — stale build`)
  }
  console.log(
    `[probe] build=minified · module=${armInfo.sha} (disk-matched) · ` +
      `crossOriginIsolated=${armInfo.isolated} · quantum ${(armInfo.quantumMs * 1000).toFixed(1)}µs`,
  )

  const counts = await page.evaluate(() => {
    const arm = (globalThis as never as { __clearBench: Driver }).__clearBench
    const proto = Node.prototype as unknown as {
      removeChild: <T extends Node>(c: T) => T
      replaceChildren: (...n: Node[]) => void
    }
    const el = Element.prototype as unknown as { replaceChildren: (...n: Node[]) => void }
    const realRemove = proto.removeChild
    const realReplace = el.replaceChildren

    let removeCalls = 0
    let removeConnected = 0
    let replaceCalls = 0
    let replaceChildrenSeen = 0

    arm.create!(1000)
    document.body.getBoundingClientRect()

    proto.removeChild = function <T extends Node>(this: Node, c: T): T {
      removeCalls++
      if ((c as unknown as { isConnected: boolean }).isConnected) removeConnected++
      return realRemove.call(this, c) as T
    }
    el.replaceChildren = function (this: Element, ...n: Node[]) {
      replaceCalls++
      replaceChildrenSeen += this.childNodes.length
      return realReplace.apply(this, n)
    }
    arm.clear!()
    proto.removeChild = realRemove
    el.replaceChildren = realReplace

    return { removeCalls, removeConnected, replaceCalls, replaceChildrenSeen }
  })

  console.log(`${'='.repeat(88)}`)
  console.log('Q1 — DOM operations during ONE `<For>` clear of 1,000 rows')
  console.log('='.repeat(88))
  console.log(`  removeChild calls           : ${counts.removeCalls}`)
  console.log(`  ...of which on a CONNECTED node: ${counts.removeConnected}`)
  console.log(`  replaceChildren calls       : ${counts.replaceCalls}`)
  console.log(
    `  children present when replaceChildren ran: ${counts.replaceChildrenSeen}` +
      `  ${counts.replaceChildrenSeen <= 2 ? '<- parent was ALREADY EMPTY: the bulk path is dead' : ''}`,
  )

  const ab = await page.evaluate(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0))
    const host = document.createElement('div')
    document.body.appendChild(host)
    const build = (n: number) => {
      host.innerHTML = ''
      const t = document.createElement('table')
      const tb = document.createElement('tbody')
      for (let i = 0; i < n; i++) {
        const tr = document.createElement('tr')
        const a = document.createElement('td')
        const c = document.createElement('td')
        a.textContent = String(i)
        c.textContent = 'lorem ipsum dolor'
        tr.appendChild(a)
        tr.appendChild(c)
        tb.appendChild(tr)
      }
      t.appendChild(tb)
      host.appendChild(t)
      return tb
    }
    const med = (a: number[]) => {
      const s = [...a].sort((x, y) => x - y)
      const m = Math.floor(s.length / 2)
      return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
    }
    const out: Record<string, number> = {}
    for (const n of [1000, 10_000]) {
      // Interleave the variants so JIT/GC debt cannot land on just one.
      const samples: Record<string, number[]> = { individual: [], bulk: [], detachedIndividual: [] }
      for (let i = 0; i < 30; i++) {
        for (const variant of ['individual', 'bulk', 'detachedIndividual'] as const) {
          const tb = build(n)
          const kids = [...tb.childNodes]
          document.body.getBoundingClientRect()
          await tick()
          let t0: number
          let t1: number
          if (variant === 'individual') {
            t0 = performance.now()
            for (const k of kids) tb.removeChild(k)
            t1 = performance.now()
          } else if (variant === 'bulk') {
            t0 = performance.now()
            tb.replaceChildren()
            t1 = performance.now()
          } else {
            // The proposed order: ONE bulk detach, then the per-node removes
            // that a cleanup loop would make — which are now no-ops because
            // `el.parentNode` is null. Measures the whole proposed sequence,
            // not just its cheap half.
            t0 = performance.now()
            tb.replaceChildren()
            for (const k of kids) {
              const p = k.parentNode
              if (p) p.removeChild(k)
            }
            t1 = performance.now()
          }
          samples[variant]!.push(t1 - t0)
          await tick()
        }
      }
      for (const k of Object.keys(samples)) out[`${k}@${n}`] = med(samples[k]!)
    }
    host.remove()
    return out
  })

  console.log(`\n${'='.repeat(88)}`)
  console.log('Q2 — cost of removing n children, bare DOM, no framework')
  console.log('='.repeat(88))
  const f = (ms: number) => (Math.abs(ms) < 1 ? `${(ms * 1000).toFixed(1)}µs` : `${ms.toFixed(2)}ms`)
  for (const n of [1000, 10_000]) {
    const ind = ab[`individual@${n}`]!
    const bulk = ab[`bulk@${n}`]!
    const det = ab[`detachedIndividual@${n}`]!
    console.log(
      `  n=${String(n).padEnd(6)} individual ${f(ind).padStart(9)}` +
        `   bulk ${f(bulk).padStart(9)}` +
        `   bulk-then-noop-removes ${f(det).padStart(9)}` +
        `   |  individual/bulk ${(ind / bulk).toFixed(2)}x` +
        `   saving ${f(ind - det).padStart(9)} (${(((ind - det) * 1e6) / n).toFixed(1)} ns/row)`,
    )
  }
} finally {
  await browser.close()
  preview.kill()
}
