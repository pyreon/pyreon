/**
 * How `atlas dev` reaches for `@pyreon/vite-plugin`'s factory.
 *
 * The JSX transform is what makes the workbench able to compile a project's
 * `.tsx` at all, so its absence is fatal HERE while Vite's is merely
 * diagnosable. Two arms decide that, and neither is reachable from a correctly
 * installed tree — which is precisely why they were never exercised:
 *
 *   * `mod.default ?? mod.pyreon` — a named alias accepted so this keeps
 *     working if the package ever adds one. An alias nothing tests is an alias
 *     that quietly stops working.
 *   * the non-function refusal, which turns "the package exported something
 *     else" into a sentence instead of `factory is not a function` thrown from
 *     inside a Vite config.
 *
 * The package is mocked per-spec: the real one always exports a default, so
 * there is no fixture that produces either shape.
 */
import { createServer } from 'node:net'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startDevServer, type DevServerHandle } from '../server'

let root: string

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
  root = mkdtempSync(join(tmpdir(), 'atlas-factory-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, type: 'module' }),
    'utf8',
  )
  writeFileSync(
    join(root, 'src', 'Hello.tsx'),
    'export function Hello(props: { name?: string }) {\n  return props.name ?? null\n}\n',
    'utf8',
  )
})

afterEach(() => {
  vi.doUnmock('@pyreon/vite-plugin')
  vi.doUnmock('vite')
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe('the plugin factory', () => {
  it('REFUSES a package that exports no factory, naming the package', async () => {
    // `default: undefined` is spelled out because vitest's mock namespace
    // THROWS on a missing export rather than returning undefined, so BOTH names
    // the product reads (`mod.default ?? mod.pyreon`) have to be spelled out for
    // the absent case to be expressible at all.
    vi.doMock('@pyreon/vite-plugin', () => ({ default: undefined, pyreon: undefined, somethingElse: 1 }))
    await expect(startDevServer({ cwd: root, port: await freePort() })).rejects.toThrow(
      /@pyreon\/vite-plugin did not export a plugin factory/,
    )
  }, 120_000)

  it('accepts the `pyreon` named export when there is no default', async () => {
    const seen: unknown[] = []
    vi.doMock('@pyreon/vite-plugin', () => ({
      default: undefined,
      pyreon: (o: unknown) => {
        seen.push(o)
        return { name: 'stand-in' }
      },
    }))
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })
      // It booted, so the alias was taken rather than refused…
      expect((await fetch(`http://localhost:${port}/`)).status).toBe(200)
      // …and it was called the same way the default export is, including the
      // option that keeps Vite's error overlay off the workbench.
      // `toContainEqual`, not an exact list: the scan's own module loader
      // boots a Vite of its own and calls the same factory (with an extra
      // `ssrTemplate`), so the server's call is one entry among several.
      expect(seen).toContainEqual({ devErrorPrinter: false })
    } finally {
      await handle?.close()
    }
  }, 120_000)
})

describe('when the tools are not installed', () => {
  it('names Vite, and says the scan does not need it', async () => {
    // Written out rather than letting `Cannot find package 'vite'` surface:
    // that does not tell a library author why a workbench needed one, and the
    // fix is not obvious from it.
    vi.doMock('vite', () => {
      throw new Error('Cannot find package')
    })
    await expect(startDevServer({ cwd: root, port: await freePort() })).rejects.toThrow(
      /atlas dev needs Vite[\s\S]*bun add -d vite @pyreon\/vite-plugin[\s\S]*`atlas scan` does not need Vite/,
    )
  }, 120_000)

  it('names the JSX plugin when THAT is what is missing', async () => {
    // The same message with the subject swapped — an install failure must not
    // send someone to install the package they already have.
    vi.doMock('@pyreon/vite-plugin', () => {
      throw new Error('Cannot find package')
    })
    await expect(startDevServer({ cwd: root, port: await freePort() })).rejects.toThrow(
      /@pyreon\/vite-plugin is not installed/,
    )
  }, 120_000)
})
