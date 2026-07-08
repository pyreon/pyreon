import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadAntiPatternsDoc,
  parseAntiPatterns,
} from '../anti-patterns'
import {
  loadBundledChangelogRegistry,
  loadChangelogRegistryWithFallback,
} from '../changelog'
import { resolveBundledContentPath } from '../content-bundle'
import {
  findPattern,
  loadPatternRegistry,
  loadPatternRegistryWithFallback,
} from '../patterns'

// ═══════════════════════════════════════════════════════════════════════════════
// These tests simulate a `bunx @pyreon/mcp` CONSUMER install: a bare project
// directory with NO monorepo files (no docs/, no .claude/, no packages/), plus
// a synthetic bundled `content/` snapshot standing in for the one the package
// ships. The loaders must fall back to the bundled snapshot so the content
// tools return REAL content instead of empty results.
// ═══════════════════════════════════════════════════════════════════════════════

/** A bare consumer project — none of the monorepo source dirs exist. */
function makeConsumerDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-mcp-consumer-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'my-app' }))
  return dir
}

/** A synthetic bundled `content/` dir mirroring what copy-content.ts produces. */
function makeBundledContentDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-mcp-bundle-'))
  const content = join(root, 'content')

  // patterns/
  mkdirSync(join(content, 'patterns'), { recursive: true })
  writeFileSync(
    join(content, 'patterns', 'signal-writes.md'),
    `---\ntitle: Signal writes\nsummary: Use signal.set(v), not signal(v)\n---\n\n# Signal writes\n\nBody about signal.set().`,
  )
  writeFileSync(
    join(content, 'patterns', 'keyed-lists.md'),
    `---\ntitle: Keyed lists\nsummary: Use <For by=...>\n---\n\n# Keyed lists\n\nBody about For.`,
  )

  // anti-patterns.md — must contain a real Pyreon category heading + bullet.
  writeFileSync(
    join(content, 'anti-patterns.md'),
    `# Anti-Patterns\n\n## Reactivity Mistakes\n\n- **Bare signal in JSX text**: wrap in an accessor.\n`,
  )

  // changelogs/<safe-name>.md — the package name is the first H1 heading.
  mkdirSync(join(content, 'changelogs'), { recursive: true })
  writeFileSync(
    join(content, 'changelogs', 'pyreon__query.md'),
    `# @pyreon/query\n\n## 0.41.2\n\n### Patch Changes\n\n- Fixed a reactive refetch bug\n`,
  )
  writeFileSync(
    join(content, 'changelogs', 'pyreon__flow.md'),
    `# @pyreon/flow\n\n## 0.41.0\n\n### Minor Changes\n\n- Added MiniMap virtualization\n`,
  )

  return join(content) // the content dir itself
}

describe('resolveBundledContentPath', () => {
  it('returns null for a non-existent segment (walk terminates cleanly)', () => {
    // Deterministic: content/nonexistent-xyz never exists in any layout.
    expect(resolveBundledContentPath('nonexistent-xyz-not-a-real-file')).toBeNull()
  })
})

describe('get_pattern — bundled fallback in a consumer', () => {
  let consumer: string
  let content: string

  beforeEach(() => {
    consumer = makeConsumerDir()
    content = makeBundledContentDir()
  })
  afterEach(() => {
    rmSync(consumer, { recursive: true, force: true })
    rmSync(join(content, '..'), { recursive: true, force: true })
  })

  it('BISECT: cwd-only loader returns EMPTY in a consumer', () => {
    // The pre-fix behaviour: no monorepo source reachable → nothing.
    const live = loadPatternRegistry(consumer)
    expect(live.root).toBeNull()
    expect(live.patterns).toEqual([])
  })

  it('falls back to the bundled snapshot → returns real patterns', () => {
    const registry = loadPatternRegistryWithFallback(consumer, join(content, 'patterns'))
    expect(registry.patterns.length).toBe(2)
    const names = registry.patterns.map((p) => p.name).sort()
    expect(names).toEqual(['keyed-lists', 'signal-writes'])
    const sw = findPattern(registry, 'signal-writes')
    expect(sw).not.toBeNull()
    expect(sw!.body).toContain('signal.set()')
    expect(sw!.summary).toBe('Use signal.set(v), not signal(v)')
  })

  it('prefers live monorepo source over the bundled snapshot', () => {
    // Give the consumer its OWN docs/patterns — the live source must win.
    mkdirSync(join(consumer, 'docs', 'patterns'), { recursive: true })
    writeFileSync(
      join(consumer, 'docs', 'patterns', 'local-only.md'),
      `---\ntitle: Local\n---\n\n# Local\n\nBody.`,
    )
    const registry = loadPatternRegistryWithFallback(consumer, join(content, 'patterns'))
    expect(registry.patterns.map((p) => p.name)).toEqual(['local-only'])
  })

  it('returns empty (no crash) when neither live nor bundled exists', () => {
    const registry = loadPatternRegistryWithFallback(consumer, null)
    expect(registry.root).toBeNull()
    expect(registry.patterns).toEqual([])
  })
})

describe('get_anti_patterns — bundled fallback in a consumer', () => {
  let consumer: string
  let content: string

  beforeEach(() => {
    consumer = makeConsumerDir()
    content = makeBundledContentDir()
  })
  afterEach(() => {
    rmSync(consumer, { recursive: true, force: true })
    rmSync(join(content, '..'), { recursive: true, force: true })
  })

  it('BISECT: without the bundled file, a consumer gets null', () => {
    expect(loadAntiPatternsDoc(consumer, null)).toBeNull()
  })

  it('falls back to the bundled anti-patterns.md → parses to entries', () => {
    const doc = loadAntiPatternsDoc(consumer, join(content, 'anti-patterns.md'))
    expect(doc).not.toBeNull()
    const entries = parseAntiPatterns(doc!)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]!.name).toBe('Bare signal in JSX text')
  })

  it("does NOT let a consumer's own non-Pyreon .claude/rules/anti-patterns.md shadow the bundled one", () => {
    // A consumer project that happens to have its own anti-patterns.md that
    // is NOT Pyreon's catalog (parses to zero entries) must fall back to the
    // bundled Pyreon snapshot, not serve the consumer's unrelated file.
    mkdirSync(join(consumer, '.claude', 'rules'), { recursive: true })
    writeFileSync(
      join(consumer, '.claude', 'rules', 'anti-patterns.md'),
      '# My own notes\n\nSome unrelated project rules, no Pyreon categories.\n',
    )
    const doc = loadAntiPatternsDoc(consumer, join(content, 'anti-patterns.md'))
    expect(doc).not.toBeNull()
    expect(parseAntiPatterns(doc!).length).toBeGreaterThan(0)
    expect(doc).toContain('## Reactivity Mistakes')
  })
})

describe('get_changelog — bundled fallback in a consumer', () => {
  let consumer: string
  let content: string

  beforeEach(() => {
    consumer = makeConsumerDir()
    content = makeBundledContentDir()
  })
  afterEach(() => {
    rmSync(consumer, { recursive: true, force: true })
    rmSync(join(content, '..'), { recursive: true, force: true })
  })

  it('loadBundledChangelogRegistry re-derives package names from the H1 heading', () => {
    const registry = loadBundledChangelogRegistry(join(content, 'changelogs'))
    expect([...registry.byName.keys()].sort()).toEqual(['@pyreon/flow', '@pyreon/query'])
    const query = registry.byName.get('@pyreon/query')!
    expect(query.entries[0]!.version).toBe('0.41.2')
    expect(query.entries[0]!.changes[0]).toContain('reactive refetch')
  })

  it('BISECT: without the bundled dir, a consumer registry is empty', () => {
    // withFallback pointed at a null bundled dir === pre-fix behaviour.
    const registry = loadChangelogRegistryWithFallback(consumer, null)
    expect(registry.byName.size).toBe(0)
  })

  it('falls back to the bundled snapshot → returns @pyreon/* changelogs', () => {
    const registry = loadChangelogRegistryWithFallback(consumer, join(content, 'changelogs'))
    expect(registry.byName.size).toBe(2)
    expect(registry.byName.has('@pyreon/query')).toBe(true)
  })

  it('loadBundledChangelogRegistry returns empty for a missing dir', () => {
    expect(loadBundledChangelogRegistry(null).byName.size).toBe(0)
    expect(
      loadBundledChangelogRegistry(join(content, 'does-not-exist')).byName.size,
    ).toBe(0)
  })
})
