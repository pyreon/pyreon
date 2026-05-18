/**
 * Tests for the 4 opt-in `frontend` best-practice lint rules:
 *   - pyreon/require-img-alt
 *   - pyreon/img-requires-dimensions
 *   - pyreon/no-positive-tabindex   (fixable)
 *   - pyreon/prefer-zero-image      (dep-gated on @pyreon/zero)
 *
 * Structure mirrors `ssg-rules.test.ts`: each rule gets paired
 * FIRES / DOES-NOT-FIRE specs to keep bisect-verification fast.
 *
 * These rules are `optIn: true`, so the standard presets force them
 * OFF. We use `getPreset('best-practices')` — which enables every
 * opt-in rule at its declared severity — to exercise the real
 * opt-in mechanic. Because the rules are not yet wired into
 * `rules/index.ts` (central integration), the preset config (built
 * from `allRules`) doesn't contain their ids; we therefore (a) pass
 * the 4 rule objects explicitly as the `rules[]` arg and (b) layer
 * explicit severity entries on top of the preset config so the
 * suite is robust both before and after central registration.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPreset } from '../config/presets'
import { imgRequiresDimensions } from '../rules/frontend/img-requires-dimensions'
import { noPositiveTabindex } from '../rules/frontend/no-positive-tabindex'
import { preferZeroImage } from '../rules/frontend/prefer-zero-image'
import { requireImgAlt } from '../rules/frontend/require-img-alt'
import { applyFixes, lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const FRONTEND_RULES = [
  requireImgAlt,
  imgRequiresDimensions,
  noPositiveTabindex,
  preferZeroImage,
]

/**
 * `best-practices` preset (enables opt-in rules at declared severity)
 * with explicit entries for the 4 frontend rule ids layered on top —
 * so the suite passes whether or not the central integration has
 * already added them to `allRules`.
 */
function bpConfig(): LintConfig {
  const base = getPreset('best-practices')
  return {
    rules: {
      ...base.rules,
      'pyreon/require-img-alt': 'error',
      'pyreon/img-requires-dimensions': 'warn',
      'pyreon/no-positive-tabindex': 'warn',
      'pyreon/prefer-zero-image': 'info',
    },
  }
}

function lint(source: string, filePath = 'src/App.tsx', config = bpConfig()) {
  return lintFile(filePath, source, FRONTEND_RULES, config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

// Sanity: the `best-practices` preset is the opt-in switch — under
// `recommended` these rules stay OFF even when passed as rules[].
describe('frontend rules — opt-in mechanic', () => {
  it('does NOT fire under the `recommended` preset (opt-in OFF)', () => {
    const result = lintFile(
      'src/App.tsx',
      `function App() { return <img src="/a.png" /> }`,
      FRONTEND_RULES,
      getPreset('recommended'),
    )
    expect(result.diagnostics).toHaveLength(0)
  })
})

// ─── 1) pyreon/require-img-alt ─────────────────────────────────────────────

describe('pyreon/require-img-alt (frontend)', () => {
  it('FIRES on `<img src=... />` with no alt attribute', () => {
    const result = lint(`function App() { return <img src="/logo.png" /> }`)
    expect(diagIds(result)).toContain('pyreon/require-img-alt')
  })

  it('FIRES on `<img>` with other attrs but still no alt', () => {
    const result = lint(
      `function App() { return <img src="/a.png" width="10" height="10" /> }`,
    )
    expect(diagIds(result)).toContain('pyreon/require-img-alt')
  })

  it('does NOT fire when `alt` is present with a value', () => {
    const result = lint(
      `function App() { return <img src="/a.png" alt="Company logo" /> }`,
    )
    expect(diagIds(result)).not.toContain('pyreon/require-img-alt')
  })

  it('does NOT fire on explicit decorative `alt=""`', () => {
    const result = lint(`function App() { return <img src="/spacer.gif" alt="" /> }`)
    expect(diagIds(result)).not.toContain('pyreon/require-img-alt')
  })

  it('does NOT fire on a non-img element with no alt', () => {
    const result = lint(`function App() { return <div src="/a.png" /> }`)
    expect(diagIds(result)).not.toContain('pyreon/require-img-alt')
  })
})

// ─── 2) pyreon/img-requires-dimensions ─────────────────────────────────────

describe('pyreon/img-requires-dimensions (frontend)', () => {
  it('FIRES on `<img>` with no width/height', () => {
    const result = lint(
      `function App() { return <img src="/a.png" alt="x" /> }`,
    )
    expect(diagIds(result)).toContain('pyreon/img-requires-dimensions')
  })

  it('FIRES on `<img>` with only width (height missing)', () => {
    const result = lint(
      `function App() { return <img src="/a.png" alt="x" width={100} /> }`,
    )
    expect(diagIds(result)).toContain('pyreon/img-requires-dimensions')
  })

  it('does NOT fire when BOTH width and height are present', () => {
    const result = lint(
      `function App() { return <img src="/a.png" alt="x" width={100} height={50} /> }`,
    )
    expect(diagIds(result)).not.toContain('pyreon/img-requires-dimensions')
  })

  it('does NOT fire on a non-img element missing dimensions', () => {
    const result = lint(`function App() { return <div src="/a.png" /> }`)
    expect(diagIds(result)).not.toContain('pyreon/img-requires-dimensions')
  })
})

// ─── 3) pyreon/no-positive-tabindex (fixable) ──────────────────────────────

describe('pyreon/no-positive-tabindex (frontend, fixable)', () => {
  it('FIRES on `tabIndex={3}` (numeric expression literal)', () => {
    const result = lint(`function App() { return <div tabIndex={3} /> }`)
    expect(diagIds(result)).toContain('pyreon/no-positive-tabindex')
  })

  it('FIRES on `tabindex="2"` (string literal)', () => {
    const result = lint(`function App() { return <div tabindex="2" /> }`)
    expect(diagIds(result)).toContain('pyreon/no-positive-tabindex')
  })

  it('does NOT fire on `tabIndex={0}`', () => {
    const result = lint(`function App() { return <div tabIndex={0} /> }`)
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })

  it('does NOT fire on `tabIndex={-1}` (programmatic-only)', () => {
    const result = lint(`function App() { return <div tabIndex={-1} /> }`)
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })

  it('does NOT fire on a dynamic `tabIndex={n}` (non-literal)', () => {
    const result = lint(`function App({ n }) { return <div tabIndex={n} /> }`)
    expect(diagIds(result)).not.toContain('pyreon/no-positive-tabindex')
  })

  it('autofix rewrites the numeric value to `0`', () => {
    const source = `function App() { return <div tabIndex={3} /> }`
    const result = lint(source)
    const diag = result.diagnostics.find(
      (d) => d.ruleId === 'pyreon/no-positive-tabindex',
    )
    expect(diag?.fix).toBeDefined()
    expect(diag?.fix?.replacement).toBe('0')
    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toBe(`function App() { return <div tabIndex={0} /> }`)
  })

  it('autofix rewrites the string value to `"0"`', () => {
    const source = `function App() { return <div tabindex="5" /> }`
    const result = lint(source)
    const diag = result.diagnostics.find(
      (d) => d.ruleId === 'pyreon/no-positive-tabindex',
    )
    expect(diag?.fix?.replacement).toBe('"0"')
    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toBe(`function App() { return <div tabindex="0" /> }`)
  })
})

// ─── 4) pyreon/prefer-zero-image (dep-gated on @pyreon/zero) ───────────────

describe('pyreon/prefer-zero-image (frontend, dep-gated)', () => {
  let zeroDir: string
  let plainDir: string

  beforeEach(() => {
    _resetProjectDepsCache()

    // Project A — declares @pyreon/zero in dependencies.
    zeroDir = mkdtempSync(join(tmpdir(), 'pyreon-zero-'))
    mkdirSync(join(zeroDir, 'src'), { recursive: true })
    writeFileSync(
      join(zeroDir, 'package.json'),
      JSON.stringify({
        name: 'zero-app',
        dependencies: { '@pyreon/zero': '^0.1.0' },
      }),
    )

    // Project B — does NOT declare @pyreon/zero.
    plainDir = mkdtempSync(join(tmpdir(), 'pyreon-plain-'))
    mkdirSync(join(plainDir, 'src'), { recursive: true })
    writeFileSync(
      join(plainDir, 'package.json'),
      JSON.stringify({
        name: 'plain-app',
        dependencies: { '@pyreon/core': '^0.1.0' },
      }),
    )
  })

  afterEach(() => {
    _resetProjectDepsCache()
    rmSync(zeroDir, { recursive: true, force: true })
    rmSync(plainDir, { recursive: true, force: true })
  })

  it('FIRES on raw `<img src=...>` in a @pyreon/zero project', () => {
    const filePath = join(zeroDir, 'src', 'Hero.tsx')
    const result = lint(
      `function Hero() { return <img src="/hero.jpg" alt="Hero" width={1} height={1} /> }`,
      filePath,
    )
    expect(diagIds(result)).toContain('pyreon/prefer-zero-image')
  })

  it('FIRES on a second raw `<img>` (multiple in one file)', () => {
    const filePath = join(zeroDir, 'src', 'Gallery.tsx')
    const result = lint(
      `function G() { return <div><img src="/a.jpg" alt="a" width={1} height={1} /><img src="/b.jpg" alt="b" width={1} height={1} /></div> }`,
      filePath,
    )
    const hits = result.diagnostics.filter(
      (d) => d.ruleId === 'pyreon/prefer-zero-image',
    )
    expect(hits.length).toBe(2)
  })

  it('does NOT fire when @pyreon/zero is NOT a project dep (auto-detect off)', () => {
    const filePath = join(plainDir, 'src', 'Hero.tsx')
    const result = lint(
      `function Hero() { return <img src="/hero.jpg" alt="Hero" width={1} height={1} /> }`,
      filePath,
    )
    expect(diagIds(result)).not.toContain('pyreon/prefer-zero-image')
  })

  it('does NOT fire on a bare `<img>` with no src even in a zero project', () => {
    const filePath = join(zeroDir, 'src', 'Placeholder.tsx')
    const result = lint(
      `function P() { return <img alt="" width={1} height={1} /> }`,
      filePath,
    )
    expect(diagIds(result)).not.toContain('pyreon/prefer-zero-image')
  })

  it('does NOT fire on the optimized `<Image>` element in a zero project', () => {
    const filePath = join(zeroDir, 'src', 'Hero.tsx')
    const result = lint(
      `function Hero() { return <Image src="/hero.jpg" alt="Hero" /> }`,
      filePath,
    )
    expect(diagIds(result)).not.toContain('pyreon/prefer-zero-image')
  })
})
