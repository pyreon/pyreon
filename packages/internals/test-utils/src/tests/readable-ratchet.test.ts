import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { countPyreonFindings } from '../../../../../scripts/check-pyreon-lint-ratchet'
import {
  buildReadableBaseline,
  checkReadable,
  compareReadable,
  countReadableFindings,
  readableCodes,
  serializeReadableBaseline,
  updateReadable,
} from '../../../../../scripts/check-readable-ratchet'

/**
 * The readable ratchet: `readable` style findings per (file, rule) may only go
 * DOWN, and a file that is not in the baseline must have none. These lock the
 * three properties that make it a gate rather than a counter.
 */

const RET = 'lint/pyreon/padding-before-return'
const DECL = 'lint/pyreon/padding-between-declarations'

const finding = (code: string, relPath: string, severity = 'warning') => ({
  code,
  severity,
  location: { relPath },
})

describe('readableCodes — derived from the rule directory', () => {
  it('names every file under rules/style as a doctor code', () => {
    const dir = join(import.meta.dirname, '../../../../tools/lint/src/rules/style')
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    const codes = readableCodes()
    expect(codes.size).toBe(files.length)
    expect(codes.has(RET)).toBe(true)
    expect(codes.has('lint/pyreon/max-jsx-depth')).toBe(true)
  })
})

describe('countReadableFindings', () => {
  it('counts per file and rule, ignoring every non-readable code', () => {
    const report = {
      findings: [
        finding(RET, 'a.ts'),
        finding(RET, 'a.ts'),
        finding(DECL, 'a.ts'),
        finding(RET, 'b.ts'),
        finding('lint/pyreon/no-classname', 'a.ts'),
      ],
    }
    expect(countReadableFindings(report)).toEqual({
      'a.ts': { 'pyreon/padding-before-return': 2, 'pyreon/padding-between-declarations': 1 },
      'b.ts': { 'pyreon/padding-before-return': 1 },
    })
  })

  it('returns {} for an empty or malformed report', () => {
    expect(countReadableFindings(null)).toEqual({})
    expect(countReadableFindings({})).toEqual({})
  })
})

describe('compareReadable — per FILE, not per rule', () => {
  const base = { 'a.ts': { r: 2 }, 'b.ts': { r: 1 } }

  it('a new finding in one file fails even when another file improved by the same amount', () => {
    // The whole reason for per-file: a per-rule TOTAL (3 → 3) would pass this.
    const { regressions, improvements } = compareReadable({ 'a.ts': { r: 3 }, 'b.ts': {} }, base)
    expect(regressions).toEqual([{ file: 'a.ts', rule: 'r', baseline: 2, current: 3 }])
    expect(improvements).toEqual([{ file: 'b.ts', rule: 'r', baseline: 1, current: 0 }])
  })

  it('a file that is not in the baseline must be clean', () => {
    const { regressions } = compareReadable({ ...base, 'new.ts': { r: 1 } }, base)
    expect(regressions).toEqual([{ file: 'new.ts', rule: 'r', baseline: 0, current: 1 }])
  })

  it('a new rule in a known file is a regression', () => {
    const { regressions } = compareReadable({ 'a.ts': { r: 2, s: 1 }, 'b.ts': { r: 1 } }, base)
    expect(regressions).toEqual([{ file: 'a.ts', rule: 's', baseline: 0, current: 1 }])
  })

  it('equal counts are neither', () => {
    expect(compareReadable(base, base)).toEqual({ regressions: [], improvements: [] })
  })
})

describe('the baseline file', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('serialises one line per file and drops zero counts', () => {
    const b = buildReadableBaseline({ 'b.ts': { r: 1 }, 'a.ts': { s: 0, r: 2 }, 'z.ts': { r: 0 } })
    expect(b.total).toBe(3)
    expect(Object.keys(b.files)).toEqual(['a.ts', 'b.ts'])
    const text = serializeReadableBaseline(b)
    expect(text).toContain('    "a.ts": {"r":2}')
    expect(JSON.parse(text)).toEqual(b)
  })

  it('--update refuses to RAISE a count, and --allow-raise allows it', () => {
    dir = mkdtempSync(join(tmpdir(), 'readable-ratchet-'))
    const path = join(dir, 'readable-baseline.json')
    expect(updateReadable({ findings: [finding(RET, 'a.ts')] }, { path })).toBe(true)
    const seeded = readFileSync(path, 'utf8')

    const grown = { findings: [finding(RET, 'a.ts'), finding(RET, 'a.ts')] }
    expect(updateReadable(grown, { path })).toBe(false)
    expect(readFileSync(path, 'utf8')).toBe(seeded)

    expect(updateReadable(grown, { path, allowRaise: true })).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8')).total).toBe(2)
  })

  it('--update tightens after a fix', () => {
    dir = mkdtempSync(join(tmpdir(), 'readable-ratchet-'))
    const path = join(dir, 'readable-baseline.json')
    updateReadable({ findings: [finding(RET, 'a.ts'), finding(RET, 'b.ts')] }, { path })
    expect(updateReadable({ findings: [finding(RET, 'a.ts')] }, { path })).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8')).files).toEqual({
      'a.ts': { 'pyreon/padding-before-return': 1 },
    })
  })

  it('checkReadable passes at the baseline and fails above it', () => {
    dir = mkdtempSync(join(tmpdir(), 'readable-ratchet-'))
    const path = join(dir, 'readable-baseline.json')
    writeFileSync(path, serializeReadableBaseline(buildReadableBaseline({ 'a.ts': { 'pyreon/padding-before-return': 1 } })))
    expect(checkReadable({ findings: [finding(RET, 'a.ts')] }, path)).toBe(true)
    expect(checkReadable({ findings: [] }, path)).toBe(true)
    expect(checkReadable({ findings: [finding(RET, 'a.ts'), finding(RET, 'a.ts')] }, path)).toBe(false)
    expect(checkReadable({ findings: [finding(RET, 'new.ts')] }, path)).toBe(false)
  })

  it('a missing baseline fails the check rather than passing silently', () => {
    dir = mkdtempSync(join(tmpdir(), 'readable-ratchet-'))
    expect(checkReadable({ findings: [] }, join(dir, 'nope.json'))).toBe(false)
  })
})

describe('the per-rule pyreon-lint ratchet leaves readable findings to this one', () => {
  it('excludes every readable code from its per-rule counts', () => {
    const report = {
      findings: [finding(RET, 'a.ts'), finding('lint/pyreon/prefer-isserver', 'a.ts')],
    }
    expect(countPyreonFindings(report)).toEqual({ 'lint/pyreon/prefer-isserver': 1 })
  })
})

describe('the committed baseline', () => {
  it('is well-formed: totals add up and every rule is a readable rule', () => {
    const path = join(import.meta.dirname, '../../../../../readable-baseline.json')
    const b = JSON.parse(readFileSync(path, 'utf8')) as {
      total: number
      files: Record<string, Record<string, number>>
    }
    const codes = readableCodes()
    let sum = 0
    for (const rules of Object.values(b.files)) {
      for (const [rule, n] of Object.entries(rules)) {
        expect(codes.has(`lint/${rule}`), rule).toBe(true)
        expect(n).toBeGreaterThan(0)
        sum += n
      }
    }
    expect(sum).toBe(b.total)
  })
})
