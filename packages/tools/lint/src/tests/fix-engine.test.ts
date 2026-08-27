import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { applyFixes, fixEdits, lintFile } from '../runner'
import type { Diagnostic, LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

/**
 * Two properties the fix engine did not have:
 *
 *  - a fix may carry SEVERAL edits, so "rewrite this expression AND add the
 *    import it now needs" is expressible at all;
 *  - overlapping fixes are DEFERRED rather than applied blind.
 */

function diag(fix: Diagnostic['fix']): Diagnostic {
  return {
    ruleId: 'test/rule',
    severity: 'error',
    message: '',
    span: { start: 0, end: 0 },
    loc: { line: 1, column: 1 },
    fix,
  }
}

describe('applyFixes — overlap handling', () => {
  it('defers a fix that overlaps one already applied instead of corrupting the file', () => {
    // Before: both were written and the second landed INSIDE the first's
    // replacement, yielding `const x = globalThis` — matching neither intent
    // and silently dropping `.innerWidth`.
    const src = 'const x = window.innerWidth'
    const out = applyFixes(src, [
      diag({ span: { start: 10, end: 26 }, replacement: 'W' }),
      diag({ span: { start: 10, end: 16 }, replacement: 'globalThis' }),
    ])
    expect(out).toBe('const x = globalThis.innerWidth')
    expect(out).not.toBe('const x = globalThis')
  })

  it('applies every non-overlapping fix in one pass', () => {
    const src = 'aaa bbb ccc'
    const out = applyFixes(src, [
      diag({ span: { start: 0, end: 3 }, replacement: 'XXX' }),
      diag({ span: { start: 8, end: 11 }, replacement: 'ZZZ' }),
    ])
    expect(out).toBe('XXX bbb ZZZ')
  })

  it('is deterministic regardless of diagnostic order', () => {
    const src = 'aaa bbb ccc'
    const a = diag({ span: { start: 0, end: 3 }, replacement: 'XXX' })
    const b = diag({ span: { start: 8, end: 11 }, replacement: 'ZZZ' })
    expect(applyFixes(src, [a, b])).toBe(applyFixes(src, [b, a]))
  })
})

describe('applyFixes — multi-edit fixes', () => {
  it('applies every edit of one fix', () => {
    const src = 'AAA middle BBB'
    const out = applyFixes(src, [
      diag([
        { span: { start: 0, end: 3 }, replacement: 'one' },
        { span: { start: 11, end: 14 }, replacement: 'two' },
      ]),
    ])
    expect(out).toBe('one middle two')
  })

  it('applies a multi-edit fix whole or not at all', () => {
    // A fix whose edits span a range already claimed must not land halfway —
    // half of "rewrite the call AND add its import" is broken code.
    const src = 'AAA middle BBB'
    const out = applyFixes(src, [
      diag({ span: { start: 0, end: 3 }, replacement: 'FIRST' }),
      diag([
        { span: { start: 0, end: 3 }, replacement: 'one' },
        { span: { start: 11, end: 14 }, replacement: 'two' },
      ]),
    ])
    expect(out).toBe('FIRST middle BBB')
    expect(out).not.toContain('two')
  })

  it('fixEdits normalizes both shapes', () => {
    expect(fixEdits({ span: { start: 0, end: 1 }, replacement: 'a' })).toHaveLength(1)
    expect(
      fixEdits([
        { span: { start: 0, end: 1 }, replacement: 'a' },
        { span: { start: 2, end: 3 }, replacement: 'b' },
      ]),
    ).toHaveLength(2)
  })
})

describe('prefer-isserver autofix (the shape single-span fixes could not express)', () => {
  let dir: string
  beforeEach(() => {
    _resetProjectDepsCache()
    dir = mkdtempSync(join(tmpdir(), 'pyreon-isv-'))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: { '@pyreon/reactivity': '*' } }),
    )
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    _resetProjectDepsCache()
  })

  const config = (): LintConfig => {
    const base = getPreset('recommended')
    base.rules['pyreon/prefer-isserver'] = 'warn'
    return base
  }

  function fixSource(name: string, source: string): string {
    const file = join(dir, 'src', name)
    writeFileSync(file, source)
    const result = lintFile(file, source, allRules, config())
    return applyFixes(source, result.diagnostics)
  }

  it('adds a new import when the package is not imported yet', () => {
    const out = fixSource('a.ts', `export const a = typeof window !== 'undefined'\n`)
    expect(out).toContain("import { isClient } from '@pyreon/reactivity'")
    expect(out).toContain('export const a = isClient')
    expect(out).not.toContain('typeof window')
  })

  it('extends an existing import instead of adding a second one', () => {
    const out = fixSource(
      'b.ts',
      `import { signal } from '@pyreon/reactivity'\nexport const b = typeof document === 'undefined'\n`,
    )
    expect(out).toContain("import { signal, isServer } from '@pyreon/reactivity'")
    expect(out.match(/from '@pyreon\/reactivity'/g)).toHaveLength(1)
    expect(out).toContain('export const b = isServer')
  })

  it('does not duplicate a specifier that is already imported', () => {
    const out = fixSource(
      'c.ts',
      `import { isServer } from '@pyreon/reactivity'\nexport const c = typeof document === 'undefined'\n`,
    )
    expect(out.match(/isServer/g)?.length).toBe(2) // the import + the use site
    expect(out).toContain('export const c = isServer')
  })

  it('REFUSES to fix through a namespace import rather than emit uncompilable code', () => {
    const src = `import * as R from '@pyreon/reactivity'\nexport const d = typeof window !== 'undefined'\nexport const u = R\n`
    const out = fixSource('d.ts', src)
    expect(out).toBe(src)
  })

  it('REFUSES to fix through a type-only import', () => {
    // Adding a value specifier to `import type { … }` produces code that does
    // not compile.
    const src = `import type { Signal } from '@pyreon/reactivity'\nexport const e = typeof window !== 'undefined'\nexport type S = Signal<number>\n`
    const out = fixSource('e.ts', src)
    expect(out).toBe(src)
  })

  it('leaves a file with several occurrences correct after one pass', () => {
    // The import edit rides on every occurrence, so overlap-deferral means one
    // lands per pass. The invariant that matters is that the file is never
    // left with a rewritten check and no import.
    const out = fixSource(
      'f.ts',
      `export const a = typeof window !== 'undefined'\nexport const b = typeof document === 'undefined'\n`,
    )
    const rewritten = /\b(isClient|isServer)\b/.test(out.replace(/^import.*$/gm, ''))
    if (rewritten) expect(out).toMatch(/^import \{ (isClient|isServer) \} from '@pyreon\/reactivity'/)
  })
})
