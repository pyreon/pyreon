import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ANTI_PATTERN_CATEGORIES,
  type AntiPatternCategory,
  formatAntiPatterns,
  parseAntiPatterns,
} from '../anti-patterns'

const HERE = dirname(fileURLToPath(import.meta.url))
// tests/ → src/ → mcp/ → tools/ → packages/ → repo root (5 ups)
const REPO_ROOT = resolve(HERE, '../../../../../')
const ANTI_PATTERNS_PATH = resolve(REPO_ROOT, '.claude/rules/anti-patterns.md')

describe('parseAntiPatterns — real repo file', () => {
  const doc = readFileSync(ANTI_PATTERNS_PATH, 'utf8')
  const entries = parseAntiPatterns(doc)

  it('returns at least one entry per documented category', () => {
    const categoriesFound = new Set(entries.map((e) => e.category))
    for (const cat of ANTI_PATTERN_CATEGORIES) {
      expect(categoriesFound.has(cat)).toBe(true)
    }
  })

  it('returns entries with non-empty name + description', () => {
    for (const entry of entries) {
      expect(entry.name.length).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(10)
    }
  })

  it('parses multi-code detector tags (e.g. "raw-add / raw-remove")', () => {
    const withDual = entries.find((e) => e.detectorCodes.length > 1)
    expect(withDual).toBeDefined()
    // The raw-listener anti-pattern in `lifecycle` / `architecture` docs
    // both codes on one bullet.
    expect(withDual!.detectorCodes).toContain('raw-add-event-listener')
  })

  it('parses single-code detector tags on known entries', () => {
    const forMissingBy = entries.find((e) =>
      e.detectorCodes.includes('for-missing-by'),
    )
    expect(forMissingBy).toBeDefined()
    expect(forMissingBy!.category).toBe('jsx')
    expect(forMissingBy!.name).toContain('by')
  })

  it('includes doc-only entries (no detector tag)', () => {
    const docOnly = entries.filter((e) => e.detectorCodes.length === 0)
    expect(docOnly.length).toBeGreaterThan(10)
  })

  it('preserves file order within each category', () => {
    // The first reactivity bullet is "Bare signal in JSX text"
    const firstReactivity = entries.find((e) => e.category === 'reactivity')
    expect(firstReactivity!.name).toBe('Bare signal in JSX text')
  })
})

describe('parseAntiPatterns — synthetic inputs', () => {
  it('ignores bullets outside a known category heading', () => {
    const doc = `# Anti-Patterns

Intro prose — never parsed as an anti-pattern.

## Unknown Heading Not In Map

- **Ignored** \`[detector: for-missing-by]\`: this should not land in output.

## Reactivity Mistakes

- **Real entry**: this one does land.
`
    const entries = parseAntiPatterns(doc)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.name).toBe('Real entry')
    expect(entries[0]!.category).toBe('reactivity')
  })

  it('strips trailing colon and leading whitespace from the description', () => {
    const doc = `## JSX Mistakes

- **X**   :   body text here`
    const [only] = parseAntiPatterns(doc)
    expect(only!.description).toBe('body text here')
  })

  it('accepts bullets with NO detector tag', () => {
    const doc = `## JSX Mistakes

- **Plain**: no tag here`
    const [only] = parseAntiPatterns(doc)
    expect(only!.detectorCodes).toEqual([])
  })

  it('survives backtick-wrapped detector tags', () => {
    const doc = `## JSX Mistakes

- **X** \`[detector: for-missing-by]\`: body`
    const [only] = parseAntiPatterns(doc)
    expect(only!.detectorCodes).toEqual(['for-missing-by'])
  })

  it('splits multi-continuation-line bullets correctly', () => {
    const doc = `## Reactivity Mistakes

- **Long one**: first line
  continuation line
  another continuation
- **Second**: short`
    const entries = parseAntiPatterns(doc)
    expect(entries).toHaveLength(2)
    expect(entries[0]!.name).toBe('Long one')
    expect(entries[0]!.description).toContain('first line')
    expect(entries[0]!.description).toContain('continuation line')
    expect(entries[1]!.name).toBe('Second')
  })
})

describe('formatAntiPatterns', () => {
  const doc = readFileSync(ANTI_PATTERNS_PATH, 'utf8')
  const entries = parseAntiPatterns(doc)

  it('renders an "all" header with entry count + category count', () => {
    const out = formatAntiPatterns(entries, 'all')
    expect(out).toMatch(/^# Pyreon Anti-Patterns \(\d+ total, \d+ categor(y|ies)\)/)
  })

  it('renders a category-filtered header', () => {
    const reactivity = entries.filter((e) => e.category === 'reactivity')
    const out = formatAntiPatterns(reactivity, 'reactivity')
    expect(out).toMatch(/^# Pyreon Anti-Patterns — reactivity \(\d+\)/)
  })

  it('includes detector tags inline on entries that have them', () => {
    const reactivity = entries.filter((e) => e.category === 'reactivity')
    const out = formatAntiPatterns(reactivity, 'reactivity')
    // "Destructuring props" has `[detector: props-destructured]`
    expect(out).toContain('`[detector: props-destructured]`')
  })

  it('returns a descriptive message when entries is empty', () => {
    const out = formatAntiPatterns([], 'jsx' as AntiPatternCategory)
    expect(out).toContain('No anti-patterns found in category')
    expect(out).toContain('Valid categories')
  })

  it('mentions validate + anti-patterns.md in the header prose', () => {
    const out = formatAntiPatterns(entries, 'all')
    expect(out).toContain('anti-patterns.md')
    expect(out).toContain('validate')
  })
})

describe('coverage parity — every detector code has a bullet', () => {
  // This test is complementary to the one in the compiler package —
  // it verifies from the MCP side that the parser surfaces every
  // detector code that downstream consumers expect.
  const doc = readFileSync(ANTI_PATTERNS_PATH, 'utf8')
  const entries = parseAntiPatterns(doc)
  const knownCodes = [
    'for-missing-by',
    'for-with-key',
    'props-destructured',
    'process-dev-gate',
    'empty-theme',
    'raw-add-event-listener',
    'raw-remove-event-listener',
    'date-math-random-id',
    'on-click-undefined',
  ]

  it.each(knownCodes)('%s appears on at least one parsed bullet', (code) => {
    const match = entries.find((e) => e.detectorCodes.includes(code))
    expect(match).toBeDefined()
  })
})
