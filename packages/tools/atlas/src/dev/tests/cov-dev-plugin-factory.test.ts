/**
 * How `atlas dev` reaches for the workbench stack — Vite, `@pyreon/vite-plugin`
 * and `@pyreon/zero` — which are optional peers.
 *
 * Neither arm is reachable from a correctly installed tree, which is precisely
 * why they need a test:
 *
 *   * a missing package is named, with the install line, rather than
 *     surfacing `Cannot find package` from inside a dynamic import;
 *   * a package that exported something other than a factory gets a sentence
 *     instead of `factory is not a function` thrown from inside a Vite config.
 *
 * The packages are mocked per-spec: the real ones always export a default, so
 * there is no fixture that produces either shape.
 */
import { createServer } from 'node:net'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startDevServer } from '../server'

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
  vi.doUnmock('@pyreon/zero/server')
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe('the plugin factory', () => {
  it('REFUSES a package that exports no factory, naming the package', async () => {
    // `default: undefined` is spelled out because vitest's mock namespace
    // THROWS on a missing export rather than returning undefined.
    vi.doMock('@pyreon/vite-plugin', () => ({ default: undefined, somethingElse: 1 }))
    await expect(startDevServer({ cwd: root, port: await freePort() })).rejects.toThrow(
      /@pyreon\/vite-plugin did not export a plugin factory/,
    )
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
      /atlas dev needs Vite[\s\S]*bun add -d vite @pyreon\/vite-plugin @pyreon\/zero[\s\S]*`atlas scan` needs none of them/,
    )
  }, 120_000)

  it('names the JSX plugin when THAT is what is missing', async () => {
    // The same message with the subject swapped — an install failure must not
    // send someone to install the package they already have.
    vi.doMock('@pyreon/vite-plugin', () => {
      throw new Error('Cannot find package')
    })
    await expect(startDevServer({ cwd: root, port: await freePort() })).rejects.toThrow(
      /atlas dev needs @pyreon\/vite-plugin, which is not installed/,
    )
  }, 120_000)

  it('names zero when THAT is what is missing', async () => {
    // The workbench is a zero app, so zero is as required as the compiler.
    vi.doMock('@pyreon/zero/server', () => {
      throw new Error('Cannot find package')
    })
    await expect(startDevServer({ cwd: root, port: await freePort() })).rejects.toThrow(
      /atlas dev needs @pyreon\/zero, which is not installed/,
    )
  }, 120_000)
})
