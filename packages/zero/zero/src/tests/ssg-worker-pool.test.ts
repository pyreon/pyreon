import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { threadId } from 'node:worker_threads'
import { createSsgWorkerPool } from '../ssg-worker-pool'

const dir = mkdtempSync(join(tmpdir(), 'pyreon-ssg-pool-'))
const entry = join(dir, 'entry.mjs')
writeFileSync(
  entry,
  `import { threadId } from 'node:worker_threads'
export default async function (path) {
  if (path === '/boom') throw new Error('loader failed for ' + path)
  if (path === '/crash') process.exit(3)
  if (path === '/old') return { kind: 'redirect', from: path, to: '/new', status: 308 }
  return { kind: 'html', appHtml: '<p>' + path + '</p>', head: '', loaderScript: '', routeModules: [String(threadId)] }
}
`,
)
const url = pathToFileURL(entry).href

describe('ssg worker pool', () => {
  it('renders on worker threads and returns plain results', async () => {
    const pool = createSsgWorkerPool(url, 3)
    try {
      const paths = Array.from({ length: 12 }, (_, i) => `/p${i}`)
      const results = await Promise.all(paths.map((p) => pool.render(p)))
      const threads = new Set<string>()
      results.forEach((r, i) => {
        expect(r.kind).toBe('html')
        if (r.kind === 'html') {
          expect(r.appHtml).toBe(`<p>${paths[i]}</p>`)
          threads.add(r.routeModules![0]!)
        }
      })
      expect(threads.has(String(threadId))).toBe(false)
      expect(threads.size).toBe(3)
      expect(await pool.render('/old')).toEqual({ kind: 'redirect', from: '/old', to: '/new', status: 308 })
    } finally {
      await pool.close()
    }
  })

  it('a render that throws rejects with the worker error, and the pool keeps working', async () => {
    const pool = createSsgWorkerPool(url, 2)
    try {
      await expect(pool.render('/boom')).rejects.toThrow('loader failed for /boom')
      expect((await pool.render('/ok')).kind).toBe('html')
    } finally {
      await pool.close()
    }
  })

  it('a crashed worker rejects its renders instead of hanging, other workers continue', async () => {
    const pool = createSsgWorkerPool(url, 2)
    try {
      await expect(pool.render('/crash')).rejects.toThrow(/exited \(code 3\)/)
      expect((await pool.render('/after')).kind).toBe('html')
    } finally {
      await pool.close()
    }
  })
})
