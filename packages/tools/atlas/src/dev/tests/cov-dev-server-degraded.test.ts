/**
 * `atlas dev` when the scan pipeline fails.
 *
 * The documented contract is a DEGRADATION, not a crash: the workbench falls
 * back to the static walk — no rocketstyle discovery, no scenarios, no
 * `atlas.config.ts` — and says so on stderr. That shape is the one that rots
 * silently, because a broken pipeline and a working one both produce a server
 * that answers 200; the only difference is a thinner catalog, which reads as
 * "this project has few components".
 *
 * The failure is injected by mocking `runScan`, because the pipeline does not
 * fail on demand: every input that breaks it is also an input the static walk
 * cannot read, so a fixture could not tell "fell back" from "found nothing".
 */
import { createServer } from 'node:net'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mutable so one spec can make the pipeline throw something that is NOT an
// Error — the reason the notice reads `err instanceof Error ? … : String(err)`.
const thrown = vi.hoisted(() => ({ asString: false }))

vi.mock('../../cli/run', () => ({
  runScan: () => {
    if (thrown.asString) throw 'a bare string, not an Error'
    throw new Error('the loader exploded')
  },
}))

import { startDevServer, type DevServerHandle } from '../server'

let root: string
let stderr: string[]

async function freePort(): Promise<number> {
  return await new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-degraded-'))
  mkdirSync(join(root, 'src', 'widgets'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, type: 'module' }),
    'utf8',
  )
  writeFileSync(
    join(root, 'src', 'widgets', 'Hello.tsx'),
    'export function Hello(props: { name?: string }) {\n  return props.name ?? null\n}\n',
    'utf8',
  )
  thrown.asString = false
  stderr = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk))
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe('a scan pipeline that throws', () => {
  it('falls back to the static walk, still serves, and names what was lost', async () => {
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })

      const said = stderr.join('')
      expect(said).toContain('the scan pipeline failed')
      // What the fallback costs, stated — so a thin catalog is not a mystery.
      expect(said).toContain('no rocketstyle discovery, no scenarios, no atlas.config.ts')
      // And the cause, which is the part a user can act on.
      expect(said).toContain('the loader exploded')

      // The static walk still found the component, and the server is up.
      expect(handle.components).toBe(1)
      const res = await fetch(`http://localhost:${port}/`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('<div id="atlas-root">')
    } finally {
      await handle?.close()
    }
  }, 120_000)
})

describe('a pipeline that throws something that is not an Error', () => {
  it('still names the cause rather than printing an object', async () => {
    // A throw does not have to be an Error, and a notice that swallows the
    // value leaves the user with a degradation and no reason for it.
    thrown.asString = true
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })
      expect(stderr.join('')).toContain('a bare string, not an Error')
      expect(handle.components).toBe(1)
    } finally {
      await handle?.close()
    }
  }, 120_000)
})
