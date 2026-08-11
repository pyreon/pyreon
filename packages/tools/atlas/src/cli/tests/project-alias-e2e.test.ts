import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runScan } from '../run'

/**
 * A project whose components import through its OWN vite alias.
 *
 * The shape from #2744: `atlas dev` boots with `configFile: false` (so the
 * project's plugins are not double-applied), which also discards its
 * `resolve.alias` — and then every `~/…` import fails. In the scan that
 * silently drops the component from the catalog; in the dev server the overlay
 * covers the whole workbench.
 */
function aliasedProject(extra?: { atlasConfig?: string; viteConfig?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-alias-'))
  mkdirSync(join(dir, 'src', 'components'), { recursive: true })
  mkdirSync(join(dir, 'src', 'shared'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{"name":"aliased","private":true,"version":"0.0.0"}')
  writeFileSync(join(dir, 'src', 'shared', 'tokens.ts'), 'export const ACCENT = "rebeccapurple"\n')
  writeFileSync(
    join(dir, 'src', 'components', 'Badge.tsx'),
    'import { ACCENT } from "~/shared/tokens"\n' +
      'export function Badge(props: { label?: string }) { return null as never }\n' +
      'export const BADGE_COLOR = ACCENT\n',
  )
  if (extra?.viteConfig !== undefined) writeFileSync(join(dir, 'vite.config.ts'), extra.viteConfig)
  if (extra?.atlasConfig !== undefined) writeFileSync(join(dir, 'atlas.config.ts'), extra.atlasConfig)
  return dir
}

const VITE_ALIAS =
  'import { resolve } from "node:path"\n' +
  'export default { resolve: { alias: { "~": resolve(import.meta.dirname, "src") } } }\n'

describe('project resolve.alias (#2744)', () => {
  it('loads a component that imports through the project vite alias', async () => {
    const dir = aliasedProject({ viteConfig: VITE_ALIAS })
    try {
      const r = await runScan({ cwd: dir, write: false })
      expect(r.loadErrors ?? []).toEqual([])
      expect(r.alias?.map((a) => String(a.find))).toEqual(['~'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)

  it('reports the aliased import as a LOAD ERROR when the project declares none', async () => {
    // The control. Without this the passing test above could be passing for
    // any reason — a scan that never loaded the file also reports no errors.
    const dir = aliasedProject()
    try {
      const r = await runScan({ cwd: dir, write: false })
      expect((r.loadErrors ?? []).map((e) => e.message).join('\n')).toContain('~/shared/tokens')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)

  it('honours an alias declared in atlas.config.ts when there is no vite config', async () => {
    // The documented escape hatch: a project whose vite config cannot be read,
    // or whose aliases live elsewhere.
    const dir = aliasedProject({
      atlasConfig:
        'import { resolve } from "node:path"\n' +
        'export const alias = { "~": resolve(import.meta.dirname, "src") }\n',
    })
    try {
      const r = await runScan({ cwd: dir, write: false })
      expect(r.loadErrors ?? []).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)
})
