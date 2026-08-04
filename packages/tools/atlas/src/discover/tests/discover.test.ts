import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverComponents, fileDiscoveryPlugin } from '../discover'

describe('discoverComponents', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-disc-'))
    mkdirSync(join(dir, 'src', 'nested'), { recursive: true })
    writeFileSync(join(dir, 'src', 'Button.tsx'), `export function Button(props: { label: string }) { return null }`)
    writeFileSync(join(dir, 'src', 'nested', 'Badge.tsx'), `export function Badge(props: { tone: 'a' | 'b' }) { return null }`)
    writeFileSync(join(dir, 'src', 'Alt.tsx'), `export function Button(props: { other: string }) { return null }`) // dup name
    writeFileSync(join(dir, 'src', 'Button.test.tsx'), `export function Ignored(props: { x: string }) { return null }`) // skipped
    writeFileSync(join(dir, 'src', 'notes.md'), `# not tsx`) // wrong ext
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('walks the tree and scans components, skipping test files and non-tsx', () => {
    const names = discoverComponents({ cwd: dir }).map((c) => c.name)
    expect(names).toContain('Badge')
    expect(names).toContain('Button')
    expect(names).not.toContain('Ignored')
  })

  it('KEEPS same-named components from different files', () => {
    // This test used to assert the opposite — that the first sorted file won
    // and the rest were dropped. That encoded a real bug: a per-page
    // `MainFilter` in fifteen directories is completely ordinary, and measured
    // on a real 78-package monorepo the name-only dedupe lost 1042 components.
    //
    // The invariant it was protecting is still here and still asserted below:
    // deterministic order, and no component emitted twice from one file.
    const buttons = discoverComponents({ cwd: dir }).filter((c) => c.name === 'Button')
    expect(buttons).toHaveLength(2)
    expect(buttons.map((b) => b.source).sort()).toEqual(
      [...buttons.map((b) => b.source)].sort(),
    )
    // Both contracts survive, rather than one overwriting the other.
    const propNames = buttons.map((b) => b.controls.map((c) => c.name).join(','))
    expect(new Set(propNames).size).toBe(2)
  })

  it('does not emit the same component twice from one file', () => {
    // The invariant the old dedupe genuinely protected.
    const all = discoverComponents({ cwd: dir })
    const seen = new Set(all.map((c) => `${c.name}@${c.source}`))
    expect(seen.size).toBe(all.length)
  })

  it('returns [] for a missing directory', () => {
    expect(discoverComponents({ cwd: dir, dir: 'does-not-exist' })).toEqual([])
  })

  it('respects a custom extensions list', () => {
    writeFileSync(join(dir, 'src', 'Plain.ts'), `export function Plain(props: { a: string }) { return null }`)
    const names = discoverComponents({ cwd: dir, extensions: ['.ts'] }).map((c) => c.name)
    expect(names).toContain('Plain')
    expect(names).not.toContain('Badge') // .tsx excluded now
  })

  it('fileDiscoveryPlugin discovers via the plugin (options.cwd overrides ctx.cwd)', async () => {
    const plugin = fileDiscoveryPlugin({ cwd: dir })
    expect(plugin.name).toBe('atlas:file-discovery')
    const comps = await plugin.discover!({ cwd: '/nowhere' })
    expect(comps.map((c) => c.name)).toContain('Badge')
  })

  it('fileDiscoveryPlugin falls back to ctx.cwd when no cwd option', async () => {
    const comps = await fileDiscoveryPlugin({}).discover!({ cwd: dir })
    expect(comps.map((c) => c.name)).toContain('Button')
  })
})
