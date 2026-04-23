import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findPattern,
  formatPatternBody,
  formatPatternIndex,
  loadPatternRegistry,
  suggestPatterns,
} from '../patterns'

const HERE = dirname(fileURLToPath(import.meta.url))
// tests/ → src/ → mcp/ → tools/ → packages/ → repo root (5 ups)
const REPO_ROOT = resolve(HERE, '../../../../../')

describe('loadPatternRegistry — real repo docs/patterns', () => {
  const registry = loadPatternRegistry(REPO_ROOT)

  it('finds the docs/patterns directory', () => {
    expect(registry.root).toBeTruthy()
    expect(registry.root).toContain('docs/patterns')
  })

  it('loads all 14 seeded patterns', () => {
    const names = registry.patterns.map((p) => p.name).sort()
    expect(names).toEqual([
      'controllable-state',
      'data-fetching',
      'dev-warnings',
      'dynamic-fields',
      'event-listeners',
      'form-fields',
      'imperative-toasts',
      'keyed-lists',
      'reactive-context',
      'routing-setup',
      'signal-writes',
      'ssr-safe-hooks',
      'state-management',
      'styler-theming',
    ])
  })

  it('every pattern has a resolvable seeAlso (no dangling references)', () => {
    // Drift guard: if pattern A says seeAlso: [b] and file b.md is
    // renamed or removed, this test fails loudly. Otherwise the
    // footer link in the MCP response would point at a ghost.
    const valid = new Set(registry.patterns.map((p) => p.name))
    const dangling: Array<{ from: string; to: string }> = []
    for (const p of registry.patterns) {
      for (const ref of p.seeAlso) {
        if (!valid.has(ref)) dangling.push({ from: p.name, to: ref })
      }
    }
    expect(dangling).toEqual([])
  })

  it('parses frontmatter on every seeded pattern', () => {
    for (const p of registry.patterns) {
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.summary).not.toBeNull()
      expect(p.summary!.length).toBeGreaterThan(10)
    }
  })

  it('parses the seeAlso array-style frontmatter', () => {
    const devWarnings = registry.patterns.find((p) => p.name === 'dev-warnings')
    expect(devWarnings).toBeDefined()
    expect(devWarnings!.seeAlso).toEqual(['ssr-safe-hooks'])
  })
})

describe('loadPatternRegistry — synthetic tmp dir', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'pyreon-mcp-patterns-'))
    mkdirSync(join(tmp, 'docs', 'patterns'), { recursive: true })
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('returns root=null when no docs/patterns exists', () => {
    // Point to a sibling dir without patterns
    const empty = mkdtempSync(join(tmpdir(), 'pyreon-mcp-empty-'))
    try {
      const r = loadPatternRegistry(empty)
      expect(r.root).toBeNull()
      expect(r.patterns).toEqual([])
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('falls back to the first heading as title when frontmatter lacks one', () => {
    writeFileSync(
      join(tmp, 'docs/patterns/no-title.md'),
      `---
summary: Has summary but no title
---

# The Heading

Body text.`,
    )
    const r = loadPatternRegistry(tmp)
    const p = r.patterns.find((x) => x.name === 'no-title')!
    expect(p.title).toBe('The Heading')
  })

  it('falls back to the slug when neither frontmatter nor heading has a title', () => {
    writeFileSync(
      join(tmp, 'docs/patterns/slug-only.md'),
      'Body with no title.',
    )
    const r = loadPatternRegistry(tmp)
    const p = r.patterns.find((x) => x.name === 'slug-only')!
    expect(p.title).toBe('slug-only')
  })

  it('parses inline-array seeAlso: [a, b, c]', () => {
    writeFileSync(
      join(tmp, 'docs/patterns/inline.md'),
      `---
title: Inline
seeAlso: [one, two, three]
---

Body.`,
    )
    const r = loadPatternRegistry(tmp)
    expect(r.patterns[0]!.seeAlso).toEqual(['one', 'two', 'three'])
  })

  it('parses block-style seeAlso with YAML bullets', () => {
    writeFileSync(
      join(tmp, 'docs/patterns/block.md'),
      `---
title: Block
seeAlso:
  - one
  - two
---

Body.`,
    )
    const r = loadPatternRegistry(tmp)
    expect(r.patterns[0]!.seeAlso).toEqual(['one', 'two'])
  })

  it('skips README.md and index.md (reserved doc filenames)', () => {
    writeFileSync(join(tmp, 'docs/patterns/README.md'), '# Should be skipped')
    writeFileSync(join(tmp, 'docs/patterns/index.md'), '# Also skipped')
    writeFileSync(join(tmp, 'docs/patterns/real.md'), '# Real pattern')
    const r = loadPatternRegistry(tmp)
    expect(r.patterns.map((p) => p.name)).toEqual(['real'])
  })
})

describe('findPattern + suggestPatterns', () => {
  const registry = loadPatternRegistry(REPO_ROOT)

  it('findPattern returns an exact match', () => {
    const p = findPattern(registry, 'dev-warnings')
    expect(p).toBeDefined()
    expect(p!.name).toBe('dev-warnings')
  })

  it('findPattern returns null for an unknown name', () => {
    const p = findPattern(registry, 'nonexistent-pattern')
    expect(p).toBeNull()
  })

  it('suggestPatterns returns slug substring matches', () => {
    const s = suggestPatterns(registry, 'warn')
    expect(s).toContain('dev-warnings')
  })

  it('suggestPatterns returns title substring matches', () => {
    const s = suggestPatterns(registry, 'controlled')
    expect(s).toContain('controllable-state')
  })

  it('suggestPatterns caps at 5 results', () => {
    const s = suggestPatterns(registry, 's') // matches many
    expect(s.length).toBeLessThanOrEqual(5)
  })
})

describe('formatPatternIndex', () => {
  const registry = loadPatternRegistry(REPO_ROOT)

  it('renders a header with the pattern count', () => {
    const out = formatPatternIndex(registry)
    expect(out).toMatch(/^# Pyreon Patterns \(\d+\)/)
  })

  it('lists every pattern as a bullet', () => {
    const out = formatPatternIndex(registry)
    for (const p of registry.patterns) {
      expect(out).toContain(`**${p.name}**`)
    }
  })

  it('returns a helpful miss message when no patterns exist', () => {
    const empty = mkdtempSync(join(tmpdir(), 'pyreon-mcp-empty-idx-'))
    try {
      const r = loadPatternRegistry(empty)
      const out = formatPatternIndex(r)
      expect(out).toContain('No patterns found')
      expect(out).toContain('docs/patterns')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('formatPatternBody', () => {
  const registry = loadPatternRegistry(REPO_ROOT)

  it('returns the pattern body', () => {
    const devWarnings = findPattern(registry, 'dev-warnings')!
    const out = formatPatternBody(devWarnings)
    expect(out).toContain('# Dev-mode warnings')
    expect(out).toContain('import.meta.env')
  })

  it('appends a See also footer when seeAlso is populated', () => {
    const devWarnings = findPattern(registry, 'dev-warnings')!
    const out = formatPatternBody(devWarnings)
    expect(out).toContain('**See also:**')
    expect(out).toContain('get_pattern({ name: "ssr-safe-hooks" })')
  })
})
