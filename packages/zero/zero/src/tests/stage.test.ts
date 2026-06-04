import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { materialize } from '../adapters/stage'

// Real-fs tests for the adapter staging primitive. The bug this guards
// (Bug A — "SSR/ISR unrunnable") is a copy-into-self EINVAL that fires ONLY
// when the destination is the same as, or a subdirectory of, the source —
// exactly the shape the zero SSR plugin passes (clientOutDir === outDir, with
// the server bundle already at outDir/server). The pre-existing adapter tests
// used a client dir DISTINCT from outDir and so never exercised it.

const TMP = join(import.meta.dirname ?? __dirname, '..', '..', '.test-stage-output')

beforeEach(async () => {
  await rm(TMP, { recursive: true, force: true })
  await mkdir(TMP, { recursive: true })
})
afterEach(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('materialize', () => {
  it('no-ops when src and dest are the same directory', async () => {
    const dir = join(TMP, 'same')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'index.html'), '<html></html>')
    // Must NOT throw (raw `cp(dir, dir)` throws ERR_FS_CP_EINVAL).
    await materialize(dir, dir)
    expect(existsSync(join(dir, 'index.html'))).toBe(true)
    // No phantom nesting created.
    expect(existsSync(join(dir, 'same'))).toBe(false)
  })

  it('COPIES entries into a subdirectory when dest is inside src (no copy-into-self, originals preserved)', async () => {
    // The canonical Bug A shape: src = dist (= outDir), dest = dist/client,
    // with a dist/server subdir that must be preserved.
    const dist = join(TMP, 'dist')
    await mkdir(join(dist, 'assets'), { recursive: true })
    await mkdir(join(dist, 'server'), { recursive: true })
    await writeFile(join(dist, 'index.html'), '<html></html>')
    await writeFile(join(dist, 'assets', 'app.js'), 'console.log(1)')
    await writeFile(join(dist, 'server', 'entry-server.js'), 'export default () => {}')

    // Raw `cp(dist, dist/client, { recursive: true })` would throw EINVAL.
    await materialize(dist, join(dist, 'client'), { preserve: ['server'] })

    // Client files materialized under client/.
    expect(existsSync(join(dist, 'client', 'index.html'))).toBe(true)
    expect(existsSync(join(dist, 'client', 'assets', 'app.js'))).toBe(true)
    // Originals PRESERVED (copied, not moved) — outDir stays a valid flat
    // layout for `vite preview` / other tooling.
    expect(existsSync(join(dist, 'index.html'))).toBe(true)
    expect(existsSync(join(dist, 'assets', 'app.js'))).toBe(true)
    // Preserved server subdir untouched + NOT nested inside client/.
    expect(existsSync(join(dist, 'server', 'entry-server.js'))).toBe(true)
    expect(existsSync(join(dist, 'client', 'server'))).toBe(false)
  })

  it('preserves scaffold entries listed in `preserve`', async () => {
    const dist = join(TMP, 'dist2')
    await mkdir(dist, { recursive: true })
    await writeFile(join(dist, 'index.html'), 'x')
    await writeFile(join(dist, 'index.js'), 'server')
    await writeFile(join(dist, 'package.json'), '{}')
    await mkdir(join(dist, 'server'), { recursive: true })

    await materialize(dist, join(dist, 'client'), {
      preserve: ['server', 'index.js', 'package.json'],
    })

    expect(existsSync(join(dist, 'client', 'index.html'))).toBe(true)
    // Scaffold files stay at the root, not swept into client/.
    expect(existsSync(join(dist, 'index.js'))).toBe(true)
    expect(existsSync(join(dist, 'package.json'))).toBe(true)
    expect(existsSync(join(dist, 'client', 'index.js'))).toBe(false)
  })

  it('recursively copies when src and dest are disjoint', async () => {
    const src = join(TMP, 'src')
    const dest = join(TMP, 'dest', 'nested')
    await mkdir(join(src, 'sub'), { recursive: true })
    await writeFile(join(src, 'a.txt'), 'a')
    await writeFile(join(src, 'sub', 'b.txt'), 'b')

    await materialize(src, dest)

    // Copied (source preserved).
    expect(await readFile(join(dest, 'a.txt'), 'utf8')).toBe('a')
    expect(await readFile(join(dest, 'sub', 'b.txt'), 'utf8')).toBe('b')
    expect(existsSync(join(src, 'a.txt'))).toBe(true)
  })

  it('copies into a DEEP nested dest (vercel .vercel/output/static shape)', async () => {
    const dist = join(TMP, 'dist3')
    await mkdir(join(dist, 'assets'), { recursive: true })
    await mkdir(join(dist, 'server'), { recursive: true })
    await writeFile(join(dist, 'index.html'), 'x')
    await writeFile(join(dist, 'assets', 'a.js'), 'a')

    const staticDir = join(dist, '.vercel', 'output', 'static')
    await materialize(dist, staticDir, { preserve: ['server'] })

    expect(existsSync(join(staticDir, 'index.html'))).toBe(true)
    expect(existsSync(join(staticDir, 'assets', 'a.js'))).toBe(true)
    // `.vercel` (dest top segment) is auto-skipped — not moved into itself.
    const distEntries = await readdir(dist)
    expect(distEntries).toContain('.vercel')
    expect(distEntries).toContain('server')
    // Client assets PRESERVED at the root (copied, not moved) so the flat
    // outDir still serves under `vite preview`.
    expect(distEntries).toContain('index.html')
  })
})
