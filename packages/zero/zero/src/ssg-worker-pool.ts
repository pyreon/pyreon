/**
 * `ssg: { workers }` — render prerender paths on N worker threads.
 *
 * The SSG loop is CPU-bound once loaders resolve: every page is a synchronous
 * tree walk plus string building, so `ssg.concurrency` (in-flight renders on
 * ONE thread) overlaps only the I/O. Worker threads render in parallel.
 * Measured on this repo's docs site prerender: 2.9× (4 workers) / 4.1× (8).
 *
 * Each worker imports the SAME built SSG entry the main thread uses and calls
 * its `default(path)` renderer, so a page is rendered by identical code; the
 * result object (`{ kind: 'html' | 'redirect', … }`) is plain data and crosses
 * the thread boundary by structured clone. Everything else — template
 * injection, writing files, manifests, the 404 page, `getStaticPaths` — stays
 * on the main thread unchanged.
 *
 * Output is byte-identical to the in-thread loop because a page's CSS depends
 * only on that page's render (the styler request scope — see
 * `@pyreon/runtime-server`'s `runWithRequestContext`), not on which other
 * pages the same thread rendered before it.
 *
 * Opt-in because it changes the execution model a loader sees: each worker
 * has its own module instances, so module-level state (an in-memory cache, a
 * DB client) exists once PER WORKER and is not shared between pages rendered
 * on different workers.
 */
import { Worker } from 'node:worker_threads'

export type SsgRenderResult =
  | { kind: 'html'; appHtml: string; head: string; loaderScript: string; routeModules?: string[] }
  | { kind: 'redirect'; from: string; to: string; status: number }

export interface SsgWorkerPool {
  render(path: string): Promise<SsgRenderResult>
  close(): Promise<void>
}

// Plain JS evaluated as a CommonJS worker (`eval: true`), so zero ships no
// extra entry file for it. `import()` of a file URL works from CJS.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
const ready = import(workerData.entry)
parentPort.on('message', async (msg) => {
  try {
    const mod = await ready
    const result = await mod.default(msg.path)
    parentPort.postMessage({ id: msg.id, result })
  } catch (err) {
    parentPort.postMessage({
      id: msg.id,
      error: {
        message: err && err.message ? String(err.message) : String(err),
        stack: err && err.stack ? String(err.stack) : undefined,
      },
    })
  }
})
`

interface Pending {
  resolve: (r: SsgRenderResult) => void
  reject: (e: Error) => void
}

/**
 * Start `count` workers over the built SSG entry at `entryUrl` (a `file:` URL).
 * `render(path)` dispatches to the least-loaded worker. A worker crash rejects
 * its in-flight renders with the crash error (the SSG loop records them per
 * path, exactly like a render that threw) — it never hangs the build.
 */
export function createSsgWorkerPool(entryUrl: string, count: number): SsgWorkerPool {
  const n = Math.max(1, Math.floor(count))
  let nextId = 0
  const slots = Array.from({ length: n }, () => {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { entry: entryUrl } })
    const pending = new Map<number, Pending>()
    let dead: Error | null = null
    worker.on('message', (m: { id: number; result?: SsgRenderResult; error?: { message: string; stack?: string } }) => {
      const p = pending.get(m.id)
      if (!p) return
      pending.delete(m.id)
      if (m.error) {
        const e = new Error(m.error.message)
        if (m.error.stack) e.stack = m.error.stack
        p.reject(e)
      } else p.resolve(m.result as SsgRenderResult)
    })
    const fail = (e: Error): void => {
      dead = e
      for (const p of pending.values()) p.reject(e)
      pending.clear()
    }
    worker.on('error', fail)
    worker.on('exit', (code) => {
      if (pending.size > 0) fail(new Error(`[Pyreon] SSG worker exited (code ${code}) with renders in flight`))
    })
    return { worker, pending, isDead: () => dead }
  })

  return {
    render(path) {
      // Least-loaded LIVE worker. A crashed worker is skipped (its pending
      // count is 0, so it would otherwise attract every later render); only
      // when all have crashed does the render reject.
      let slot: (typeof slots)[number] | undefined
      for (const s of slots) if (!s.isDead() && (!slot || s.pending.size < slot.pending.size)) slot = s
      if (!slot) return Promise.reject(slots[0]!.isDead())
      const id = nextId++
      return new Promise<SsgRenderResult>((resolve, reject) => {
        slot.pending.set(id, { resolve, reject })
        slot.worker.postMessage({ id, path })
      })
    },
    async close() {
      await Promise.all(slots.map((s) => s.worker.terminate()))
    },
  }
}
