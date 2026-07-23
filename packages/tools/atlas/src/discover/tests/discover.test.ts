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

  it('dedupes components by name (first sorted file wins)', () => {
    const buttons = discoverComponents({ cwd: dir }).filter((c) => c.name === 'Button')
    expect(buttons).toHaveLength(1)
    // Alt.tsx sorts before Button.tsx, so its `other` prop wins
    expect(buttons[0]!.controls.map((c) => c.name)).toEqual(['other'])
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
