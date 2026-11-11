/**
 * zero's optional native peers stay OUT of the node SSR bundle.
 *
 * zero imports `sharp` only lazily (`await import('sharp')`), so a server must
 * start whether or not sharp — and its native binary — is installed. Inside a
 * workspace the peer resolves only from zero's own node_modules, not from the
 * app root, so Vite bundled it; rolldown then put its shared `__exportAll`
 * helper in the sharp chunk, the server entry imported that chunk statically,
 * and the server crashed at startup on the missing native binary.
 *
 * This drives a REAL `buildSsrBundle` (no vite stub) from an app root where
 * sharp does not resolve, over an entry that reaches a lazy `import('sharp')`
 * through a module that lives inside zero (`fixtures/lazy-native-peer.ts`).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildSsrBundle, materializeEntry, OPTIONAL_NATIVE_PEERS } from '../ssr-build-shared'

const FIXTURE = fileURLToPath(new URL('./fixtures/lazy-native-peer.ts', import.meta.url))
const ENV_FLAG = '__ZERO_TEST_OPTIONAL_PEERS__'

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? listFiles(p) : [p]
  })
}

describe('optional native peers are external in the node SSR sub-build', () => {
  let root: string
  let outDir: string

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'zero-optional-peers-'))
    outDir = join(root, 'out')
    const entryPath = join(root, '.zero-entry.js')
    await materializeEntry(
      entryPath,
      `import { helpers, loadSharp } from ${JSON.stringify(FIXTURE)}\n` +
        'export default { helpers, loadSharp }\n',
    )
    await buildSsrBundle({
      root,
      entryPath,
      outDir,
      outputFilename: 'entry-server.js',
      envFlag: ENV_FLAG,
      userConfig: {},
      userPlugins: [],
    })
  }, 120_000)

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('does not bundle sharp — the lazy import stays a runtime import', () => {
    const files = listFiles(outDir).filter((f) => /\.m?js$/.test(f))
    const code = files.map((f) => readFileSync(f, 'utf-8')).join('\n')
    expect(code, 'sharp source was bundled into the SSR output').not.toContain(
      'sharp.pixelplumbing.com',
    )
    expect(code).toMatch(/import\(\s*["']sharp["']\s*\)/)
  })

  it('the server entry evaluates without sharp being loadable', () => {
    // A fresh node process from the app root, where sharp does not resolve:
    // what a deployed server does at startup. Whether a BUNDLED sharp is
    // evaluated eagerly depends on where rolldown places its shared helpers
    // (this small fixture keeps them in the entry), so the test above is the
    // load-bearing one; this one guards the startup outcome itself.
    const entry = join(outDir, 'entry-server.js')
    const r = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(entry)})`],
      { cwd: root, encoding: 'utf-8' },
    )
    expect(r.stderr).not.toContain('sharp')
    expect(r.status).toBe(0)
  })
})

describe('OPTIONAL_NATIVE_PEERS matches package.json', () => {
  it('lists every optional peer zero declares', async () => {
    // A new optional native peer must be added to the external list, or it
    // is bundled — and evaluated at startup — the way sharp was.
    const pkg = JSON.parse(
      await readFile(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf-8'),
    ) as { peerDependenciesMeta?: Record<string, { optional?: boolean }> }
    const optional = Object.entries(pkg.peerDependenciesMeta ?? {})
      .filter(([, m]) => m.optional)
      .map(([name]) => name)
      .sort()
    expect([...OPTIONAL_NATIVE_PEERS].sort()).toEqual(optional)
  })
})
