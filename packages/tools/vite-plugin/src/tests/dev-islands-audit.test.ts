/**
 * The islands doctor-lite that runs once on `vite dev` boot.
 *
 * Two island declarations sharing a `name` is a silent failure: the
 * client registry is keyed by name, so only the FIRST loader ever fires
 * and the second component never hydrates — no error, no warning from
 * the browser, just a piece of the page that does not respond. The
 * audit exists so the author learns at boot rather than from a bug
 * report.
 *
 * It is deferred a second so it never delays the first request, and
 * wrapped so an audit failure cannot take the dev server down with it —
 * a diagnostic that crashes the thing it diagnoses is worse than none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pyreonPlugin from '../index'

type Hook = (this: unknown, ...a: never[]) => unknown

let root: string
let pkgSrc: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-vp-audit-'))
  // `auditIslands` walks `<monorepoRoot>/packages` and `/examples`, and
  // finds that root by looking UPWARD for a directory containing
  // `packages/`. A flat project therefore scans nothing and reports
  // nothing — which is why the fixture is shaped this way, and worth
  // knowing: the boot audit is a no-op outside that layout.
  pkgSrc = join(root, 'packages', 'app', 'src')
  mkdirSync(pkgSrc, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'audit-fixture' }))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const island = (name: string) =>
  `import { island } from '@pyreon/server/client'\n`
  + `export const C = island(() => import('./C'), { name: '${name}', hydrate: 'load' })\n`

/** Boot the plugin's dev server and let the deferred audit run. */
async function bootAndWait(opts: Record<string, unknown> = { islands: true }) {
  const warnings: string[] = []
  const spy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
    warnings.push(a.map(String).join(' '))
  })
  const plugin = pyreonPlugin(opts as never)
  ;(plugin.config as unknown as Hook).call(null, { root } as never, { command: 'serve' } as never)
  ;(plugin.configureServer as unknown as Hook).call(null, {
    moduleGraph: { getModuleById: () => null, invalidateModule: () => {} },
    middlewares: { use: () => {} },
    config: { logger: { warn: () => {}, info: () => {} } },
    ws: { send: () => {} },
    watcher: { on: () => {}, add: () => {}, close: () => {} },
    httpServer: { on: () => {} },
    ssrLoadModule: async () => ({}),
  } as never)
  // The audit is deferred so it never delays the first request.
  await new Promise<void>((r) => setTimeout(r, 1600))
  spy.mockRestore()
  return warnings.join('\n')
}

describe('a duplicate island NAME is reported at boot', () => {
  it('warns, naming the duplicate and how to see details', async () => {
    // The registry is keyed by name, so only the first loader fires and
    // the second island never hydrates — silently.
    writeFileSync(join(pkgSrc, 'a.island.tsx'), island('Shared'))
    writeFileSync(join(pkgSrc, 'b.island.tsx'), island('Shared'))
    const out = await bootAndWait()
    expect(out, 'the boot audit must say something').toContain('Pyreon islands')
    expect(out, 'and name the defect class').toContain('duplicate')
    expect(out, 'and the shared name').toContain('Shared')
    expect(out, 'and point at the full report').toContain('doctor')
  }, 20_000)

  it('reports NO duplicate when the names differ', async () => {
    // The control in the other direction. Asserting a totally silent
    // boot would be wrong: an island nothing imports is a legitimate
    // separate finding, and this fixture has two of them. The claim
    // being made is about the duplicate-name check specifically.
    writeFileSync(join(pkgSrc, 'a.island.tsx'), island('One'))
    writeFileSync(join(pkgSrc, 'b.island.tsx'), island('Two'))
    expect(await bootAndWait()).not.toContain('duplicate')
  }, 20_000)

  it('says nothing when islands are DISABLED', async () => {
    // The audit must not run for a project that opted out.
    writeFileSync(join(pkgSrc, 'a.island.tsx'), island('Shared'))
    writeFileSync(join(pkgSrc, 'b.island.tsx'), island('Shared'))
    expect(await bootAndWait({ islands: false })).not.toContain('Pyreon islands')
  }, 20_000)

  it('does not take the dev server down when the audit throws', async () => {
    // A diagnostic that crashes the thing it diagnoses is worse than
    // none. An unreadable directory is the ordinary cause.
    rmSync(root, { recursive: true, force: true })
    await expect(bootAndWait()).resolves.toBeDefined()
    mkdirSync(pkgSrc, { recursive: true })
  }, 20_000)
})
