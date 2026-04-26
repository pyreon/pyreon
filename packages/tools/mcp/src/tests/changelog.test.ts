import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareVersions,
  filterSince,
  findChangelog,
  formatChangelog,
  formatChangelogIndex,
  loadChangelogRegistry,
  parseChangelog,
  suggestChangelogs,
} from '../changelog'

const HERE = dirname(fileURLToPath(import.meta.url))
// tests/ → src/ → mcp/ → tools/ → packages/ → repo root (5 ups)
const REPO_ROOT = resolve(HERE, '../../../../../')

describe('parseChangelog — synthetic inputs', () => {
  it('returns an empty array on an empty file', () => {
    expect(parseChangelog('')).toEqual([])
  })

  it('ignores prose before the first ## version heading', () => {
    const doc = `# @pyreon/foo\n\nSome intro that should not land as a version.\n\n## 1.0.0\n\n- Added X`
    const entries = parseChangelog(doc)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.version).toBe('1.0.0')
    expect(entries[0]!.changes).toEqual(['Added X'])
  })

  it('parses ceremonial empty-version bumps as { empty: true }', () => {
    const doc = '# @pyreon/foo\n\n## 0.5.2\n\n## 0.5.1\n'
    const entries = parseChangelog(doc)
    expect(entries.map((e) => e.version)).toEqual(['0.5.2', '0.5.1'])
    expect(entries.every((e) => e.empty)).toBe(true)
  })

  it('splits user-facing changes from dependency-update bullets', () => {
    const doc = `
## 0.13.0

### Patch Changes

- Added shiny new thing
- Updated dependencies [[\`a1b2\`]]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
`
    const [entry] = parseChangelog(doc)
    expect(entry!.changes).toEqual(['Added shiny new thing'])
    expect(entry!.dependencyUpdates).toHaveLength(1)
    expect(entry!.dependencyUpdates[0]).toContain('@pyreon/core@0.13.0')
    expect(entry!.empty).toBe(false)
  })

  it('joins multi-line bullet continuations into one entry', () => {
    const doc = `
## 0.13.0

### Minor Changes

- First line of a long change
  second line indented
  third line

  - sub-bullet under the first change
  - another sub-bullet

- Separate top-level change
`
    const [entry] = parseChangelog(doc)
    expect(entry!.changes).toHaveLength(2)
    expect(entry!.changes[0]).toContain('First line')
    expect(entry!.changes[0]).toContain('second line')
    expect(entry!.changes[0]).toContain('sub-bullet')
    expect(entry!.changes[1]).toContain('Separate top-level')
  })

  it('collapses ### Patch/Minor/Major Changes headings — keeps only bullets', () => {
    const doc = `
## 0.14.0

### Major Changes

- Big thing

### Minor Changes

- Small thing

### Patch Changes

- Tiny fix
`
    const [entry] = parseChangelog(doc)
    expect(entry!.changes).toEqual(['Big thing', 'Small thing', 'Tiny fix'])
  })
})

describe('loadChangelogRegistry — real repo', () => {
  const registry = loadChangelogRegistry(REPO_ROOT)

  it('discovers the monorepo root', () => {
    expect(registry.root).toBe(REPO_ROOT)
  })

  it('loads at least 40 packages with CHANGELOG.md', () => {
    expect(registry.byName.size).toBeGreaterThanOrEqual(40)
  })

  it('every loaded package has a @pyreon/ name + non-empty path', () => {
    for (const [name, cl] of registry.byName) {
      expect(name).toMatch(/^@pyreon\//)
      expect(cl.path).toContain('CHANGELOG.md')
      expect(cl.dir).not.toContain('node_modules')
    }
  })

  it('finds @pyreon/query and parses its entries', () => {
    const q = registry.byName.get('@pyreon/query')
    expect(q).toBeDefined()
    expect(q!.entries.length).toBeGreaterThan(0)
    const substantive = q!.entries.filter((e) => !e.empty)
    expect(substantive.length).toBeGreaterThan(0)
  })
})

describe('findChangelog + suggestChangelogs', () => {
  const registry = loadChangelogRegistry(REPO_ROOT)

  it('finds by fully-qualified name', () => {
    const q = findChangelog(registry, '@pyreon/query')
    expect(q).toBeDefined()
    expect(q!.packageName).toBe('@pyreon/query')
  })

  it('finds by short slug (auto-prefixes @pyreon/)', () => {
    const q = findChangelog(registry, 'query')
    expect(q).toBeDefined()
    expect(q!.packageName).toBe('@pyreon/query')
  })

  it('returns null for an unknown package', () => {
    expect(findChangelog(registry, 'nonexistent')).toBeNull()
    expect(findChangelog(registry, '@pyreon/bogus')).toBeNull()
  })

  it('suggestChangelogs returns substring matches', () => {
    const s = suggestChangelogs(registry, 'router')
    expect(s).toContain('@pyreon/router')
  })

  it('suggestChangelogs caps at 5', () => {
    const s = suggestChangelogs(registry, 'p') // matches many
    expect(s.length).toBeLessThanOrEqual(5)
  })
})

describe('formatChangelog', () => {
  const registry = loadChangelogRegistry(REPO_ROOT)

  it('renders a header with shown / total counts', () => {
    const q = findChangelog(registry, 'query')!
    const out = formatChangelog(q)
    expect(out).toMatch(/^# @pyreon\/query — changelog \(\d+\/\d+ shown\)/)
  })

  it('respects the limit option', () => {
    const q = findChangelog(registry, 'query')!
    const limited = formatChangelog(q, { limit: 1 })
    const versionHeadings = limited.split('\n').filter((l) => /^## /.test(l))
    expect(versionHeadings).toHaveLength(1)
  })

  it('omits Updated-dependencies bullets by default', () => {
    const q = findChangelog(registry, 'query')!
    const out = formatChangelog(q, { limit: 10 })
    expect(out).not.toContain('Updated dependencies')
  })

  it('includes Updated-dependencies when the option is true', () => {
    const q = findChangelog(registry, 'query')!
    const out = formatChangelog(q, { limit: 10, includeDependencyUpdates: true })
    expect(out).toContain('Updated dependencies')
  })

  it('returns a "ceremonial bumps only" miss message for empty changelogs', () => {
    const synthetic = {
      packageName: '@pyreon/empty',
      path: '/tmp/nonexistent/CHANGELOG.md',
      dir: '/tmp/nonexistent',
      entries: [
        { version: '0.1.0', changes: [], dependencyUpdates: [], empty: true },
        { version: '0.0.9', changes: [], dependencyUpdates: [], empty: true },
      ],
    }
    const out = formatChangelog(synthetic)
    expect(out).toContain('no substantive changes')
    expect(out).toContain('ceremonial version bump')
  })
})

describe('compareVersions', () => {
  it('orders by numeric segments', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('0.13.0', '0.12.15')).toBeGreaterThan(0) // 13 > 12
    expect(compareVersions('0.12.15', '0.13.0')).toBeLessThan(0)
    expect(compareVersions('0.0.9', '0.0.10')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('handles missing segments as 0', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1', '1.0.1')).toBeLessThan(0)
  })

  it('orders stable above pre-release', () => {
    expect(compareVersions('1.0.0', '1.0.0-alpha.1')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-alpha.1', '1.0.0')).toBeLessThan(0)
  })

  it('orders pre-releases lexicographically within the same core', () => {
    expect(compareVersions('1.0.0-alpha.1', '1.0.0-beta.1')).toBeLessThan(0)
    expect(compareVersions('1.0.0-alpha.3', '1.0.0-alpha.2')).toBeGreaterThan(0)
  })

  it('tolerates non-numeric segments as 0', () => {
    // Not expected from changesets but shouldn't crash.
    // "abc" parses to 0, so "abc.1" == "0.1" == [0, 1] and they tie.
    expect(compareVersions('abc.1', '0.1')).toBe(0)
    expect(compareVersions('', '0.0.0')).toBe(0)
    // Numeric still wins over non-numeric.
    expect(compareVersions('1.0.0', 'abc.0.0')).toBeGreaterThan(0)
  })
})

describe('filterSince', () => {
  const entries = [
    { version: '0.13.0', changes: ['X'], dependencyUpdates: [], empty: false },
    { version: '0.12.15', changes: ['Y'], dependencyUpdates: [], empty: false },
    { version: '0.12.14', changes: ['Z'], dependencyUpdates: [], empty: false },
  ]

  it('returns entries strictly newer than the floor', () => {
    const after = filterSince(entries, '0.12.15')
    expect(after.map((e) => e.version)).toEqual(['0.13.0'])
  })

  it('returns all entries when the floor is below every entry', () => {
    const after = filterSince(entries, '0.0.1')
    expect(after).toHaveLength(3)
  })

  it('returns empty when the floor equals or exceeds every entry', () => {
    expect(filterSince(entries, '0.13.0')).toEqual([])
    expect(filterSince(entries, '1.0.0')).toEqual([])
  })

  it('preserves file order (newest-first)', () => {
    const after = filterSince(entries, '0.12.13')
    expect(after.map((e) => e.version)).toEqual(['0.13.0', '0.12.15', '0.12.14'])
  })
})

describe('formatChangelog — since option', () => {
  const changelog = {
    packageName: '@pyreon/foo',
    path: '/tmp/CHANGELOG.md',
    dir: '/tmp',
    entries: [
      { version: '0.13.0', changes: ['Latest change'], dependencyUpdates: [], empty: false },
      { version: '0.12.15', changes: ['Middle'], dependencyUpdates: [], empty: false },
      { version: '0.12.14', changes: ['Oldest'], dependencyUpdates: [], empty: false },
    ],
  }

  it('includes only versions strictly newer than `since`', () => {
    const out = formatChangelog(changelog, { since: '0.12.15', limit: 10 })
    expect(out).toContain('## 0.13.0')
    expect(out).not.toContain('## 0.12.15')
    expect(out).not.toContain('## 0.12.14')
  })

  it('shows a dedicated "no changes since vX" miss message', () => {
    const out = formatChangelog(changelog, { since: '0.13.0' })
    expect(out).toContain('no changes since v0.13.0')
    expect(out).toContain('known latest substantive version is v0.13.0')
  })

  it('labels the header with the since floor', () => {
    const out = formatChangelog(changelog, { since: '0.12.15' })
    expect(out).toMatch(/^# @pyreon\/foo — changelog since v0\.12\.15 \(\d+\/\d+ shown\)/)
  })
})

describe('formatChangelogIndex', () => {
  const registry = loadChangelogRegistry(REPO_ROOT)

  it('lists every package with its latest substantive version', () => {
    const out = formatChangelogIndex(registry)
    expect(out).toMatch(/^# Pyreon Changelogs \(\d+ packages\)/)
    expect(out).toContain('**@pyreon/query**')
    expect(out).toContain('**@pyreon/router**')
  })

  it('returns a helpful miss message when no packages/ dir', () => {
    const empty = loadChangelogRegistry('/tmp')
    const out = formatChangelogIndex(empty)
    expect(out).toContain('No changelogs found')
    expect(out).toContain('Pyreon monorepo')
  })
})
