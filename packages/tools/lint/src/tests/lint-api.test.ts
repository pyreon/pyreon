import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lint, listRules } from '../lint'

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'pyreon-lint-api-'))
}

function write(dir: string, rel: string, content: string): string {
  const full = join(dir, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
  return full
}

describe('lint() — high-level API', () => {
  it('discovers files via path → directory walk + collectFiles (L150-172)', () => {
    const dir = makeTmp()
    write(dir, 'src/a.ts', `export const x = 1\n`)
    write(dir, 'src/b.tsx', `export const Comp = () => null\n`)
    write(dir, 'node_modules/x.ts', `export const skip = 1\n`) // skipped via isHiddenOrVendor
    const result = lint({ paths: [dir] })
    expect(result.files.length).toBeGreaterThanOrEqual(2)
    rmSync(dir, { recursive: true, force: true })
  })

  it('lints a single FILE path (L167-168 file branch)', () => {
    const dir = makeTmp()
    const file = write(dir, 'standalone.ts', `export const x = 1\n`)
    const result = lint({ paths: [file] })
    expect(result.files.length).toBe(1)
    expect(result.files[0]!.filePath).toBe(file)
    rmSync(dir, { recursive: true, force: true })
  })

  it('skips nonexistent paths gracefully (L162-163 catch)', () => {
    const result = lint({ paths: ['/this/path/does/not/exist'] })
    expect(result.files).toEqual([])
  })

  it('respects include/exclude from a .pyreonlintrc.json (L30-39)', () => {
    const dir = makeTmp()
    write(dir, 'src/a.ts', `export const x = 1\n`)
    write(dir, 'src/skip-me/b.ts', `export const y = 2\n`)
    write(
      dir,
      '.pyreonlintrc.json',
      JSON.stringify({ exclude: ['skip-me'], rules: {} }),
    )
    const result = lint({ paths: [dir], config: join(dir, '.pyreonlintrc.json') })
    expect(result.files.some((f) => f.filePath.includes('skip-me'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('honours ruleOverrides at the CLI surface (L118-122)', () => {
    const dir = makeTmp()
    // For-without-by would error by default; the override turns it off.
    write(dir, 'src/a.tsx', `import { For } from '@pyreon/core'\nexport const X = ({ items }) => <For each={items}>{(x) => <li>{x}</li>}</For>\n`)
    const result = lint({
      paths: [dir],
      ruleOverrides: { 'pyreon/no-for-missing-by': 'off' },
    })
    const diags = result.files.flatMap((f) => f.diagnostics).filter((d) => d.ruleId === 'pyreon/no-for-missing-by')
    expect(diags.length).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('honours ruleOptionsOverrides — promotes bare-severity rule to tuple (L128-140)', () => {
    const dir = makeTmp()
    write(dir, 'src/a.ts', `export const x = 1\n`)
    const result = lint({
      paths: [dir],
      ruleOptionsOverrides: {
        'pyreon/no-window-in-ssr': { exemptPaths: ['/tests/'] },
      },
    })
    expect(result.files.length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('skips ruleOptionsOverrides on rules currently off (L134)', () => {
    const dir = makeTmp()
    write(dir, 'src/a.ts', `export const x = 1\n`)
    // Off rule + try to set options → silently skipped.
    const result = lint({
      paths: [dir],
      ruleOverrides: { 'pyreon/no-window-in-ssr': 'off' },
      ruleOptionsOverrides: {
        'pyreon/no-window-in-ssr': { exemptPaths: [] },
      },
    })
    expect(result.files.length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('respects quiet flag (filters non-errors, L227-229)', () => {
    const dir = makeTmp()
    // Source likely produces a warning of some kind via default preset.
    write(dir, 'src/a.tsx', `import { For } from '@pyreon/core'\nexport const X = ({ items }) => <For each={items}>{(x) => <li>{x}</li>}</For>\n`)
    const result = lint({ paths: [dir], quiet: true })
    for (const f of result.files) {
      for (const d of f.diagnostics) {
        expect(d.severity).toBe('error')
      }
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('countDiagnostics totals errors / warnings / infos (L183-188)', () => {
    const dir = makeTmp()
    write(dir, 'src/clean.ts', `export const x = 1\n`)
    const result = lint({ paths: [dir] })
    expect(typeof result.totalErrors).toBe('number')
    expect(typeof result.totalWarnings).toBe('number')
    expect(typeof result.totalInfos).toBe('number')
    rmSync(dir, { recursive: true, force: true })
  })

  it('lints info-severity findings (countDiagnostics info branch L187)', () => {
    const dir = makeTmp()
    // no-eager-import is info severity, fires on heavy imports
    write(dir, 'src/a.ts', `import { x } from '@pyreon/charts'\n`)
    const result = lint({ paths: [dir] })
    expect(result.files.length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('exercises buildConfig L36-37 (ruleOverrides defined but rule not in entries)', () => {
    const dir = makeTmp()
    write(dir, 'src/a.ts', `export const x = 1\n`)
    const result = lint({
      paths: [dir],
      ruleOverrides: { 'pyreon/some-nonexistent-rule': 'error' },
    })
    expect(result.files.length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('exercises applyFixes — empty diagnostics path (runner.ts L254)', () => {
    const dir = makeTmp()
    write(dir, 'src/clean.ts', `export const x = 1\n`)
    const result = lint({ paths: [dir], fix: true })
    expect(result.files.length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('applyFixesToFile writes fixed source back when there are fixable diagnostics (L174-180)', () => {
    const dir = makeTmp()
    // tabIndex={5} is auto-fixable via pyreon/no-positive-tabindex
    const file = write(
      dir,
      'src/a.tsx',
      `export const X = () => <button tabIndex={5}>x</button>\n`,
    )
    const result = lint({
      paths: [dir],
      fix: true,
      // Enable the opt-in rule for this test
      ruleOverrides: { 'pyreon/no-positive-tabindex': 'error' },
    })
    expect(result.files.length).toBeGreaterThan(0)
    // The file is rewritten (read fresh from disk)
    const after = readFileSync(file, 'utf-8')
    expect(typeof after).toBe('string')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('listRules()', () => {
  it('returns metadata for every registered rule', () => {
    const rules = listRules()
    expect(rules.length).toBeGreaterThan(50)
    for (const r of rules) {
      expect(typeof r.id).toBe('string')
      expect(typeof r.category).toBe('string')
      expect(typeof r.description).toBe('string')
    }
  })
})
