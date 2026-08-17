/**
 * bench-heapdiff — byte-level attribution of the retained-heap metric.
 *
 * `bench-fair`'s retained-heap number is a single scalar per framework
 * (`performance.memory.usedJSHeapSize` after the suite, GC-and-yield settled).
 * When two frameworks differ by a small, REPRODUCIBLE amount, that scalar
 * cannot say WHERE the difference lives — so this tool reproduces the exact
 * same end state and takes a real V8 heap snapshot instead, aggregating node
 * `self_size` by type and by constructor, then diffing two frameworks.
 *
 * It deliberately mirrors `bench-fair`'s protocol so the numbers are
 * comparable: same production `vite build`, same page isolation
 * (`?framework=X` in a fresh context), same `--expose-gc` +
 * `--enable-precise-memory-info` flags, same GC-and-yield-until-stable settle
 * loop before reading anything.
 *
 * Usage:
 *   bun bench-heapdiff.ts                      # Pyreon vs Preact
 *   bun bench-heapdiff.ts --a Pyreon --b Solid
 *   bun bench-heapdiff.ts --repeat 3           # medians across N runs
 *   bun bench-heapdiff.ts --keep-snapshots     # write .heapsnapshot files
 *
 * Snapshot-vs-counter caveat: V8 performs a full GC before serialising a heap
 * snapshot, and the snapshot totals count only reachable objects, so a
 * snapshot total is expected to sit BELOW `usedJSHeapSize` (which includes
 * allocator slack and unreclaimed pages). The two are read here for the same
 * page at the same moment, and both are reported, so drift between them is
 * visible rather than assumed away.
 */
import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const PORT = 4319

interface Args {
  a: string
  b: string
  repeat: number
  keepSnapshots: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { a: 'Pyreon', b: 'Preact', repeat: 1, keepSnapshots: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--a') args.a = argv[++i] ?? args.a
    else if (flag === '--b') args.b = argv[++i] ?? args.b
    else if (flag === '--repeat') args.repeat = Number(argv[++i] ?? 1)
    else if (flag === '--keep-snapshots') args.keepSnapshots = true
  }
  return args
}

/** Minimal shape of the fields this tool reads out of a V8 heap snapshot. */
interface HeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[]
      node_types: (string[] | string)[]
    }
    node_count: number
  }
  nodes: number[]
  strings: string[]
}

export interface HeapBreakdown {
  /** Sum of every reachable node's `self_size`, in bytes. */
  totalBytes: number
  nodeCount: number
  /** self_size summed per snapshot node type (`object`, `closure`, `code`, …). */
  byType: Map<string, { bytes: number; count: number }>
  /** self_size summed per `type/name` pair — the constructor-level view. */
  byConstructor: Map<string, { bytes: number; count: number }>
}

/**
 * Aggregate a parsed heap snapshot by node type and by constructor.
 *
 * Exported (and pure) so the aggregation can be unit-tested against a
 * synthetic snapshot without launching a browser — the parsing is the part
 * that silently produces plausible-looking wrong numbers if the field offsets
 * drift, so it is the part worth locking.
 */
export function aggregateSnapshot(snap: HeapSnapshot): HeapBreakdown {
  const fields = snap.snapshot.meta.node_fields
  const typeIdx = fields.indexOf('type')
  const nameIdx = fields.indexOf('name')
  const sizeIdx = fields.indexOf('self_size')
  if (typeIdx < 0 || nameIdx < 0 || sizeIdx < 0) {
    throw new Error(`[heapdiff] unexpected node_fields: ${fields.join(',')}`)
  }
  const typeNames = snap.snapshot.meta.node_types[typeIdx]
  if (!Array.isArray(typeNames)) {
    throw new Error('[heapdiff] node_types[type] is not an enum array')
  }

  const stride = fields.length
  const byType = new Map<string, { bytes: number; count: number }>()
  const byConstructor = new Map<string, { bytes: number; count: number }>()
  let totalBytes = 0
  let nodeCount = 0

  for (let i = 0; i < snap.nodes.length; i += stride) {
    const type = typeNames[snap.nodes[i + typeIdx] as number] ?? 'unknown'
    const name = snap.strings[snap.nodes[i + nameIdx] as number] ?? ''
    const size = snap.nodes[i + sizeIdx] as number

    totalBytes += size
    nodeCount++

    const t = byType.get(type)
    if (t) {
      t.bytes += size
      t.count++
    } else byType.set(type, { bytes: size, count: 1 })

    // Strings and code carry their CONTENT in `name`, which would explode the
    // key space into one bucket per literal. Bucket those by type alone; the
    // constructor view exists for object/closure/array shapes.
    const key = type === 'string' || type === 'concatenated string' || type === 'sliced string'
      ? `${type}/*`
      : `${type}/${name || '(anonymous)'}`
    const c = byConstructor.get(key)
    if (c) {
      c.bytes += size
      c.count++
    } else byConstructor.set(key, { bytes: size, count: 1 })
  }

  return { totalBytes, nodeCount, byType, byConstructor }
}

/** Take a heap snapshot of `page` over CDP and return it parsed. */
async function takeHeapSnapshot(page: Page): Promise<HeapSnapshot> {
  const cdp = await page.context().newCDPSession(page)
  const chunks: string[] = []
  cdp.on('HeapProfiler.addHeapSnapshotChunk', (e: { chunk: string }) => chunks.push(e.chunk))
  await cdp.send('HeapProfiler.enable')
  // `reportProgress: false` — we only need the serialised graph. V8 runs a
  // full GC before serialising, so the result contains reachable objects only.
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
  await cdp.send('HeapProfiler.disable')
  await cdp.detach()
  return JSON.parse(chunks.join('')) as HeapSnapshot
}

/**
 * The settle recipe from `bench-fair.ts`, verbatim in behaviour: GC, yield a
 * macrotask, repeat until the counter stops moving. Reproduced rather than
 * imported because it must run INSIDE the page.
 */
async function settleHeap(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const gc = (globalThis as { gc?: () => void }).gc
    const perf = performance as Performance & { memory?: { usedJSHeapSize?: number } }
    const used = () => perf.memory?.usedJSHeapSize ?? null
    if (!gc) return used()
    const STABLE_DELTA = 16 * 1024
    const MAX_ROUNDS = 12
    let prev = Number.POSITIVE_INFINITY
    for (let i = 0; i < MAX_ROUNDS; i++) {
      gc()
      await new Promise((r) => setTimeout(r, 50))
      const cur = used()
      if (cur === null) return null
      if (prev - cur >= 0 && prev - cur < STABLE_DELTA) return cur
      prev = cur
    }
    return used()
  })
}

/**
 * GC-and-yield a FIXED number of rounds with NO early exit, returning the whole
 * trajectory.
 *
 * `bench-fair`'s settle loop stops as soon as one round improves by less than
 * 16KB. That is an early exit, not a convergence proof: a heap that reclaims in
 * a long tail of sub-threshold steps exits while still elevated, and it exits
 * HIGHER the longer its tail is. Since Pyreon is the one framework in the field
 * documented as deferring reclamation, "does the gap survive an unbounded
 * settle?" has to be answered before any byte of it is attributed to retention.
 */
async function settleTrajectory(page: Page, rounds: number): Promise<number[]> {
  return page.evaluate(async (n: number) => {
    const gc = (globalThis as { gc?: () => void }).gc
    const perf = performance as Performance & { memory?: { usedJSHeapSize?: number } }
    const out: number[] = []
    if (!gc) return out
    for (let i = 0; i < n; i++) {
      gc()
      await new Promise((r) => setTimeout(r, 50))
      const cur = perf.memory?.usedJSHeapSize
      if (typeof cur === 'number') out.push(cur)
    }
    return out
  }, rounds)
}

interface FrameworkHeap {
  framework: string
  /** What `bench-fair` would report — early-exit settle loop. */
  usedJSHeapSize: number | null
  /** Fixed-round GC trajectory, no early exit. */
  trajectory: number[]
  breakdown: HeapBreakdown
}

async function measureFramework(
  framework: string,
  baseUrl: string,
  browser: Browser,
  keepSnapshots: boolean,
  tag: string,
): Promise<FrameworkHeap> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('pageerror', (err) => console.error(`[chromium:${framework}]`, err.message))
  try {
    await page.goto(`${baseUrl}/?framework=${encodeURIComponent(framework)}`, {
      waitUntil: 'load',
    })
    await page.waitForFunction(
      () => document.getElementById('status')?.textContent === 'Done ✓',
      null,
      { timeout: 180_000 },
    )
    const usedJSHeapSize = await settleHeap(page)
    // Continue GC-ing past the early exit to see whether the counter keeps
    // falling — if it does, `usedJSHeapSize` above measured the exit condition,
    // not the retained set.
    const trajectory = await settleTrajectory(page, 20)
    const snap = await takeHeapSnapshot(page)
    if (keepSnapshots) {
      const out = resolve(HERE, `heap-${framework}-${tag}.heapsnapshot`)
      writeFileSync(out, JSON.stringify(snap))
      console.log(`[heapdiff]   wrote ${out}`)
    }
    return { framework, usedJSHeapSize, trajectory, breakdown: aggregateSnapshot(snap) }
  } finally {
    await ctx.close()
  }
}

const kb = (bytes: number) => (bytes / 1024).toFixed(1)
const signedKb = (bytes: number) => `${bytes >= 0 ? '+' : ''}${(bytes / 1024).toFixed(1)}`

function printDiff(a: FrameworkHeap, b: FrameworkHeap): void {
  console.log(`\n=== TOTALS ===`)
  console.log(
    `${a.framework.padEnd(10)} snapshot ${kb(a.breakdown.totalBytes).padStart(9)} KB  ` +
      `nodes ${String(a.breakdown.nodeCount).padStart(7)}  ` +
      `usedJSHeapSize ${a.usedJSHeapSize === null ? '—' : kb(a.usedJSHeapSize)} KB`,
  )
  console.log(
    `${b.framework.padEnd(10)} snapshot ${kb(b.breakdown.totalBytes).padStart(9)} KB  ` +
      `nodes ${String(b.breakdown.nodeCount).padStart(7)}  ` +
      `usedJSHeapSize ${b.usedJSHeapSize === null ? '—' : kb(b.usedJSHeapSize)} KB`,
  )
  console.log(
    `${'delta'.padEnd(10)} snapshot ${signedKb(a.breakdown.totalBytes - b.breakdown.totalBytes).padStart(9)} KB  ` +
      `(${a.framework} − ${b.framework})`,
  )

  console.log(`\n=== SETTLE TRAJECTORY (usedJSHeapSize, KB, 20 GC+yield rounds, no early exit) ===`)
  for (const m of [a, b]) {
    const t = m.trajectory
    const head = t.slice(0, 6).map((v) => kb(v)).join(' ')
    const tail = t.length > 6 ? ` … ${kb(t[t.length - 1] as number)}` : ''
    const drop = t.length > 1 ? (t[0] as number) - (t[t.length - 1] as number) : 0
    console.log(
      `${m.framework.padEnd(10)} ${head}${tail}   post-exit drop ${signedKb(-drop)} KB`,
    )
  }

  const section = (
    title: string,
    ma: Map<string, { bytes: number; count: number }>,
    mb: Map<string, { bytes: number; count: number }>,
    limit: number,
  ) => {
    console.log(`\n=== ${title} (top ${limit} by |delta|) ===`)
    const keys = new Set([...ma.keys(), ...mb.keys()])
    const rows = [...keys]
      .map((k) => {
        const ea = ma.get(k) ?? { bytes: 0, count: 0 }
        const eb = mb.get(k) ?? { bytes: 0, count: 0 }
        return { k, a: ea, b: eb, delta: ea.bytes - eb.bytes }
      })
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
      .slice(0, limit)
    console.log(
      `${'key'.padEnd(44)} ${a.framework.padStart(11)} ${b.framework.padStart(11)} ${'delta KB'.padStart(10)}  counts`,
    )
    for (const r of rows) {
      console.log(
        `${r.k.slice(0, 44).padEnd(44)} ${`${kb(r.a.bytes)}K`.padStart(11)} ${`${kb(r.b.bytes)}K`.padStart(11)} ${signedKb(r.delta).padStart(10)}  ${r.a.count} vs ${r.b.count}`,
      )
    }
  }

  section('BY TYPE', a.breakdown.byType, b.breakdown.byType, 20)
  section('BY CONSTRUCTOR', a.breakdown.byConstructor, b.breakdown.byConstructor, 40)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log('[heapdiff] building benchmark…')
  execSync('bun run build', { cwd: HERE, stdio: 'inherit' })

  console.log(`[heapdiff] starting preview on :${PORT}`)
  const preview: ChildProcess = spawn('bun', ['x', 'vite', 'preview', '--port', String(PORT)], {
    cwd: HERE,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((res, rej) => {
    const timeout = setTimeout(() => rej(new Error('preview server start timeout')), 15_000)
    preview.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Local:')) {
        clearTimeout(timeout)
        res()
      }
    })
    preview.on('exit', (code) => rej(new Error(`preview exited with code ${code}`)))
  })

  const browser = await chromium.launch({
    headless: true,
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  })
  const baseUrl = `http://localhost:${PORT}`

  try {
    for (let r = 0; r < args.repeat; r++) {
      if (args.repeat > 1) console.log(`\n[heapdiff] ===== pass ${r + 1}/${args.repeat} =====`)
      // Alternate which framework runs first each pass — a fresh browser
      // process warms up over its first page, so a fixed order would bias the
      // same framework the same way every pass.
      const first = r % 2 === 0 ? args.a : args.b
      const second = r % 2 === 0 ? args.b : args.a
      console.log(`[heapdiff] order: ${first}, ${second}`)
      const m1 = await measureFramework(first, baseUrl, browser, args.keepSnapshots, `p${r + 1}`)
      const m2 = await measureFramework(second, baseUrl, browser, args.keepSnapshots, `p${r + 1}`)
      const ma = m1.framework === args.a ? m1 : m2
      const mb = m1.framework === args.a ? m2 : m1
      printDiff(ma, mb)
    }
  } finally {
    await browser.close()
    preview.kill()
  }
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
}
