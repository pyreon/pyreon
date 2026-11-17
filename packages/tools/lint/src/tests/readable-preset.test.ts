import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parsePresetList } from '../cli'
import { getPreset, isPresetName } from '../config/presets'
import { resolveLintConfig } from '../lint'
import { readable, readableStrict } from '../oxfmt'
import { allRules } from '../rules/index'
import { applyFixes, isGeneratedSource, lintFile, parseSuppression } from '../runner'
import type { RuleEntry, Severity } from '../types'

const sev = (e: RuleEntry | undefined): Severity | undefined =>
  e === undefined ? undefined : Array.isArray(e) ? (e[0] as Severity) : (e as Severity)

const opts = (e: RuleEntry | undefined) => (Array.isArray(e) ? e[1] : undefined)

const STYLE_IDS = allRules.filter((r) => r.meta.category === 'style').map((r) => r.meta.id)

const READABLE = [
  'pyreon/padding-between-declarations',
  'pyreon/padding-before-return',
  'pyreon/padding-between-component-sections',
  'pyreon/max-jsx-depth',
  'pyreon/no-nested-ternary-branch',
]

describe('composable presets', () => {
  it('every base preset keeps the style rules off', () => {
    for (const name of ['recommended', 'strict', 'app', 'lib', 'best-practices'] as const) {
      const cfg = getPreset(name)
      for (const id of STYLE_IDS) expect(sev(cfg.rules[id]), `${name} ${id}`).toBe('off')
    }
  })

  it('`readable` turns on exactly its rules, at warn, with the p99 thresholds', () => {
    const cfg = getPreset(['recommended', 'readable'])
    for (const id of READABLE) expect(sev(cfg.rules[id]), id).toBe('warn')
    expect(sev(cfg.rules['pyreon/padding-around-multiline-blocks'])).toBe('off')
    expect(opts(cfg.rules['pyreon/max-jsx-depth'])).toEqual({ max: 6 })
    expect(opts(cfg.rules['pyreon/no-nested-ternary-branch'])).toEqual({ maxOutcomes: 4 })
  })

  it('`readable-strict` adds block padding and tightens to the p95 thresholds', () => {
    const cfg = getPreset(['recommended', 'readable-strict'])
    expect(sev(cfg.rules['pyreon/padding-around-multiline-blocks'])).toBe('warn')
    expect(opts(cfg.rules['pyreon/max-jsx-depth'])).toEqual({ max: 5 })
    expect(opts(cfg.rules['pyreon/no-nested-ternary-branch'])).toEqual({ maxOutcomes: 3 })
  })

  it('a layer on top of strict keeps strict’s errors and adds WARNINGS, never errors', () => {
    const strict = getPreset('strict')
    const both = getPreset(['strict', 'readable'])
    for (const r of allRules) {
      if (r.meta.category === 'style') continue
      expect(both.rules[r.meta.id], r.meta.id).toEqual(strict.rules[r.meta.id])
    }
    for (const id of READABLE) expect(sev(both.rules[id]), id).toBe('warn')
  })

  it('a later base preset resets an earlier layer (layers go last)', () => {
    const cfg = getPreset(['readable', 'recommended'])
    for (const id of READABLE) expect(sev(cfg.rules[id]), id).toBe('off')
  })

  it('a layer alone, or a list of layers, starts from recommended', () => {
    const rec = getPreset('recommended')
    for (const cfg of [getPreset('readable'), getPreset(['readable'])]) {
      expect(sev(cfg.rules['pyreon/no-classname'])).toBe(sev(rec.rules['pyreon/no-classname']))
      expect(Object.keys(cfg.rules)).toHaveLength(allRules.length)
      for (const id of READABLE) expect(sev(cfg.rules[id]), id).toBe('warn')
    }
  })

  it('the single-string form is unchanged', () => {
    expect(getPreset('recommended')).toEqual(getPreset(['recommended']))
    expect(getPreset('strict')).toEqual(getPreset(['strict']))
  })

  it('an unknown preset name throws a [Pyreon] error naming the valid ones', () => {
    expect(() => getPreset(['recommended', 'readabel' as never])).toThrow(/\[Pyreon\] Unknown lint preset "readabel".*readable/)
    expect(isPresetName('readable-strict')).toBe(true)
    expect(isPresetName('nope')).toBe(false)
  })

  it('the `style` group switch turns every style rule on or off', () => {
    const on = resolveLintConfig({ preset: 'recommended', groups: { style: 'warn' } })
    for (const id of STYLE_IDS) expect(sev(on.rules[id]), id).toBe('warn')
    const off = resolveLintConfig({ preset: ['recommended', 'readable'], groups: { style: 'off' } })
    for (const id of STYLE_IDS) expect(sev(off.rules[id]), id).toBe('off')
  })

  it('the schema accepts the list form and every preset name', () => {
    const schema = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', '..', 'schema', 'pyreonlintrc.schema.json'), 'utf8'),
    )
    const names: string[] = schema.definitions.presetName.enum
    for (const n of names) expect(isPresetName(n), n).toBe(true)
    expect(names.sort()).toEqual(
      ['app', 'best-practices', 'lib', 'readable', 'readable-strict', 'recommended', 'strict'].sort(),
    )
    expect(schema.properties.preset.oneOf[1].type).toBe('array')
  })
})

describe('the CLI', () => {
  it('parses a comma list of presets and drops unknown names', () => {
    expect(parsePresetList('recommended,readable')).toEqual(['recommended', 'readable'])
    expect(parsePresetList(' strict , readable-strict ')).toEqual(['strict', 'readable-strict'])
    expect(parsePresetList(undefined)).toBeUndefined()
  })

  it('an absent --preset leaves the config file’s preset in charge', () => {
    // Regression: the CLI defaulted `preset` to 'recommended', and an explicit
    // option wins over the file — so `pyreon-lint .` silently ignored
    // `"preset": [..., "readable"]` (and `"strict"`) in every project.
    const cfg = resolveLintConfig({ preset: ['recommended', 'readable'] }, { preset: undefined })
    expect(sev(cfg.rules['pyreon/padding-before-return'])).toBe('warn')
  })
})

describe('suppression directives', () => {
  const RULES: Record<string, RuleEntry> = { 'pyreon/padding-before-return': 'warn', 'pyreon/no-nested-ternary-branch': 'warn' }
  const body = (prefix: string) =>
    `export function f() {\n  g()\n  g()\n  g()\n${prefix}  return 1\n}\ndeclare function g(): void\n`
  const run = (src: string) => lintFile('/p/src/a.ts', src, allRules, { rules: RULES }).diagnostics

  it('next-line suppression accepts a reason after `--`', () => {
    expect(parseSuppression('// pyreon-lint-disable-next-line pyreon/x -- table layout')).toEqual({
      ruleIds: ['pyreon/x'],
      reason: 'table layout',
    })
    expect(parseSuppression('// pyreon-lint-ignore pyreon/a, pyreon/b -- why')?.ruleIds).toEqual(['pyreon/a', 'pyreon/b'])
    expect(parseSuppression('// pyreon-lint-ignore -- whole line')).toEqual({ ruleIds: [], reason: 'whole line' })
    expect(parseSuppression('// pyreon-lint-ignored pyreon/x')).toBeNull()
  })

  it('a reasoned next-line suppression actually suppresses', () => {
    // The `return` is reported on its own line; the directive must sit above it.
    const src = `export function f() {\n  g()\n  g()\n  g()\n  // pyreon-lint-disable-next-line pyreon/padding-before-return -- kept tight on purpose\n  return 1\n}\ndeclare function g(): void\n`
    // (a comment above the return already satisfies the rule, so prove the
    // directive on a rule that a comment does not satisfy)
    const ternary = `declare const a: boolean, b: boolean\n// pyreon-lint-disable-next-line pyreon/no-nested-ternary-branch -- mirrors the spec table\nexport const x = a ? (b ? 1 : 2) : 3\n`
    expect(run(src)).toEqual([])
    expect(run(ternary)).toEqual([])
    expect(run(ternary.replace('pyreon/no-nested-ternary-branch -- ', 'pyreon/other -- '))).toHaveLength(1)
  })

  it('a file-level disable with a reason turns the rule off for the whole file', () => {
    const src = `// pyreon-lint-disable-file pyreon/padding-before-return -- generated-shaped table code\n${body('')}`
    expect(run(body(''))).toHaveLength(1)
    expect(run(src)).toEqual([])
  })

  it('a file-level disable WITHOUT a reason is ignored and reported', () => {
    const src = `// pyreon-lint-disable-file pyreon/padding-before-return\n${body('')}`
    const d = run(src)
    expect(d.map((x) => x.ruleId).sort()).toEqual(['pyreon-lint/disable-file-reason', 'pyreon/padding-before-return'])
    expect(d.find((x) => x.ruleId === 'pyreon-lint/disable-file-reason')?.message).toContain('-- <why>')
  })

  it('a bare file-level disable with a reason turns off every rule', () => {
    const src = `// pyreon-lint-disable-file -- vendored copy of upstream\ndeclare const a: boolean, b: boolean\nexport const x = a ? (b ? 1 : 2) : 3\n${body('')}`
    expect(run(src)).toEqual([])
  })
})

describe('generated-file detection', () => {
  it('reads only the first three lines', () => {
    expect(isGeneratedSource('// @generated\nx')).toBe(true)
    expect(isGeneratedSource('/**\n * GENERATED by scripts/build.ts\n */')).toBe(true)
    expect(isGeneratedSource('// a\n// b\n// Do not edit by hand\n')).toBe(true)
    expect(isGeneratedSource('// a\n// b\n// c\n// @generated\n')).toBe(false)
    expect(isGeneratedSource('export const x = 1\n')).toBe(false)
  })
})

// ── the lint/formatter contract ──────────────────────────────────────────────

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..')
const OXFMT = join(ROOT, 'node_modules', '.bin', 'oxfmt')

describe('fix → format → lint is stable (the rules never fight oxfmt)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-readable-fmt-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const STRICT = getPreset(['recommended', 'readable-strict'])
  const lintStyle = (file: string, src: string) =>
    lintFile(file, src, allRules, STRICT).diagnostics.filter((d) => d.ruleId.startsWith('pyreon/') && STYLE_IDS.includes(d.ruleId))

  function format(file: string, preset: object): string {
    const cfg = join(dir, 'oxfmt.json')
    writeFileSync(cfg, JSON.stringify(preset))
    execFileSync(OXFMT, ['-c', cfg, file], { stdio: 'ignore' })

    return readFileSync(file, 'utf8')
  }

  const FIXTURES: Record<string, string> = {
    'component.tsx': [
      "import { signal, computed, effect } from '@pyreon/reactivity'",
      "import { For } from '@pyreon/core'",
      'const LIMIT = 3',
      'export function List(props: { rows: string[] }) {',
      '  const count = signal(0)',
      '  const shown = computed(() => props.rows.slice(0, LIMIT))',
      '  // bump the counter',
      '  const bump = () => count.update((n) => n + 1)',
      '  effect(() => console.log(count()))',
      '  if (!props.rows.length) return null',
      '  return <ul onClick={bump}><For each={shown()} by={(r) => r}>{(r) => <li class="row">{r}</li>}</For></ul>',
      '}',
      'export function total(xs: number[]) {',
      '  let n = 0',
      '  for (const x of xs) {',
      '    n += x',
      '  }',
      '  const avg = n / xs.length',
      '  return avg',
      '}',
      '',
    ].join('\n'),
    'module.ts': [
      'export class Store {',
      '  items: string[] = []',
      '  add(x: string) {',
      '    this.items.push(x)',
      '  }',
      '  /** remove one */',
      '  remove(x: string) {',
      '    const i = this.items.indexOf(x)',
      '    if (i >= 0) {',
      '      this.items.splice(i, 1)',
      '    }',
      '    return i',
      '  }',
      '}',
      'export function f(a: string): string',
      'export function f(a: any) {',
      '  switch (a) {',
      "    case 'x': {",
      '      const y = 1',
      '      const z = 2',
      '      const w = 3',
      '      return y + z + w',
      '    }',
      '  }',
      '  return a',
      '}',
      '',
    ].join('\n'),
  }

  it('the formatter binary is installed (a missing one must fail, not skip)', () => {
    expect(existsSync(OXFMT), OXFMT).toBe(true)
  })

  for (const [name, source] of Object.entries(FIXTURES)) {
    for (const [label, preset] of [
      ['readable', readable],
      ['readableStrict', readableStrict],
    ] as const) {
      it(`${name} with oxfmt ${label}: fix → format → lint leaves nothing, and format → fix → format is a no-op`, () => {
        const file = join(dir, name)
        // fix → format → lint
        const fixedSrc = applyFixes(source, lintFile(file, source, allRules, STRICT).diagnostics)
        writeFileSync(file, fixedSrc)
        const formatted = format(file, preset)
        expect(lintStyle(file, formatted).filter((d) => d.fix)).toEqual([])

        // format → fix → format: the fix after formatting changes nothing the
        // formatter then wants to undo.
        const fixedAgain = applyFixes(formatted, lintFile(file, formatted, allRules, STRICT).diagnostics)
        writeFileSync(file, fixedAgain)
        expect(format(file, preset)).toBe(fixedAgain)
      })
    }
  }
})
