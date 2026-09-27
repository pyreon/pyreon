/**
 * `ssg: { workers }` — REAL `vite build` of a fixture, asserting the two
 * things a unit test of the pool cannot:
 *
 *   1. pages are actually rendered OFF the main thread. The fixture's loaders
 *      append `<path> <threadId>` to a log file (a side channel, so the HTML
 *      itself is unaffected). An earlier cut of the feature never started the
 *      pool, rendered everything on the main thread, and every other test —
 *      including a byte-identity comparison — stayed green.
 *   2. the output is byte-identical to the single-thread build.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { threadId } from 'node:worker_threads'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'
import { zeroPlugin } from '../../vite-plugin'

const FIXTURE = resolve(import.meta.dirname, 'fixture-ssg-workers')
const scratch = mkdtempSync(join(tmpdir(), 'pyreon-ssg-workers-'))

async function buildWith(workers: number, tag: string): Promise<{ out: string; log: string[] }> {
  const out = join(scratch, `dist-${tag}`)
  const logFile = join(scratch, `threads-${tag}.log`)
  process.env.PYREON_SSG_THREAD_LOG = logFile
  try {
    await build({
      root: FIXTURE,
      configFile: false,
      logLevel: 'error',
      plugins: zeroPlugin({ mode: 'ssg', ssg: { workers } }),
      resolve: { conditions: ['bun'] },
      build: { outDir: out, emptyOutDir: true },
    })
  } finally {
    delete process.env.PYREON_SSG_THREAD_LOG
  }
  const log = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n') : []
  return { out, log }
}

function htmlFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>()
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.html')) files.set(relative(dir, p), readFileSync(p, 'utf8'))
    }
  }
  walk(dir)
  return files
}

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssg-entry.js'), { force: true })
  await rm(join(FIXTURE, '__pyreon-zero-ssr-entry.js'), { force: true })
})

describe('ssg.workers — real build', () => {
  it(
    'renders pages on worker threads, byte-identical to the single-thread build',
    async () => {
      const single = await buildWith(1, 'w1')
      const pooled = await buildWith(3, 'w3')

      // Premise: the side channel works, and the single-thread build ran on
      // THIS thread (vitest's worker), so its thread id is the baseline.
      const threadsOf = (log: string[]): Set<string> =>
        new Set(log.filter((l) => l.startsWith('/')).map((l) => l.split(' ')[1]!))
      expect(single.log.length).toBeGreaterThanOrEqual(17)
      expect([...threadsOf(single.log)]).toEqual([String(threadId)])

      // The pooled build rendered every path, and none of them here.
      const pooledPaths = new Set(pooled.log.map((l) => l.split(' ')[0]))
      for (const p of ['/', ...Array.from({ length: 16 }, (_, i) => `/${i}`)]) {
        expect(pooledPaths.has(p), `path ${p} rendered`).toBe(true)
      }
      const pooledThreads = threadsOf(pooled.log)
      expect(pooledThreads.has(String(threadId))).toBe(false)
      expect(pooledThreads.size).toBeGreaterThan(1)

      // Identical output. Asset file names are content hashes of identical
      // client builds, so no normalization is needed.
      const a = htmlFiles(single.out)
      const b = htmlFiles(pooled.out)
      expect([...b.keys()].sort()).toEqual([...a.keys()].sort())
      expect(a.size).toBeGreaterThanOrEqual(17)
      for (const [file, html] of a) expect(b.get(file), file).toBe(html)
    },
    240_000,
  )
})
