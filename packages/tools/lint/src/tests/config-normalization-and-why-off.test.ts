/**
 * The config plumbing every rule's behaviour is decided by, and the command
 * that explains it.
 *
 * A rule config entry has two spellings — a bare severity and a
 * `[severity, options]` tuple — and every consumer has to normalize them:
 * the runner deciding whether to run a rule, the CLI merging `--rule-options`
 * on top, `--why-off` explaining what it found. Three normalizers of one
 * shape is exactly where they drift, and a drift here is silent in the worst
 * way: options land on a rule that is off, or a tuple entry reads as a
 * severity object, and the rule quietly does nothing while the config says it
 * is on.
 *
 * `--why-off` is the command that exists because that failure is otherwise
 * undiagnosable, so its own accuracy is load-bearing: an explanation that
 * omits a reason sends the reader to change something that was never the
 * cause.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lint } from '../lint'
import { explainRuleState, formatRuleState } from '../why-off'
import type { LintConfig, LintConfigFile } from '../types'

let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-cfg-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@pyreon/cfg-fixture',
      dependencies: { '@pyreon/core': '*', '@pyreon/reactivity': '*', '@pyreon/router': '*' },
    }),
  )
  // A file that trips `no-positive-tabindex`, which is cheap and unambiguous.
  writeFileSync(join(root, 'src/a.tsx'), `export const A = () => <div tabIndex={3} />\n`)
  writeFileSync(join(root, 'src/b.tsx'), `export const B = () => <div tabIndex={4} />\n`)
})
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

const ID = 'pyreon/no-positive-tabindex'

/**
 * Lint the fixture with `file` as its config, going through the REAL config
 * loader — the normalizers under test live on that path, and constructing a
 * `LintConfig` in memory would step over them.
 */
const run = (file: LintConfigFile, paths: string[] = [join(root, 'src')]) => {
  const cfg = join(root, 'rc.json')
  writeFileSync(cfg, JSON.stringify(file))
  const res = lint({ paths, config: cfg } as never)
  const diagnostics = res.files.flatMap((f) => f.diagnostics)
  return { res, diagnostics }
}

const count = (file: LintConfigFile, paths?: string[]) =>
  run(file, paths).diagnostics.filter((d) => d.ruleId === ID).length

describe('a rule entry reads the same in both spellings', () => {
  it('runs from a BARE severity', () => {
    expect(count({ rules: { [ID]: 'error' } } as never)).toBeGreaterThan(0)
  })

  it('runs from a TUPLE with no options', () => {
    expect(count({ rules: { [ID]: ['error', {}] } } as never)).toBeGreaterThan(0)
  })

  it('runs from a tuple whose options slot is absent', () => {
    // `['error']` is legal JSON for a tuple entry and arrives with
    // `entry[1] === undefined`. Reading it without a fallback is a crash in
    // the one code path that decides whether ANY rule runs.
    expect(count({ rules: { [ID]: ['error'] } } as never)).toBeGreaterThan(0)
  })

  it('is OFF from a bare `off`', () => {
    expect(count({ rules: { [ID]: 'off' } } as never)).toBe(0)
  })

  it('is OFF from a tuple `off`', () => {
    // The spelling that silently ran the rule anyway would be the worst of the
    // four: the config says off, the output says otherwise.
    expect(count({ rules: { [ID]: ['off', {}] } } as never)).toBe(0)
  })

  it('carries the SEVERITY through from a tuple', () => {
    const d = run({ rules: { [ID]: ['warn', {}] } } as never).diagnostics.find(
      (x) => x.ruleId === ID,
    )
    expect(d?.severity).toBe('warn')
  })
})

describe('`exemptPaths` is honoured from either spelling', () => {
  it('exempts a path given in tuple options', () => {
    expect(
      count({ rules: { [ID]: ['error', { exemptPaths: ['src/a.tsx'] }] } } as never),
    ).toBe(1) // b.tsx still reports
  })

  it('exempts BOTH files when the pattern covers them', () => {
    expect(count({ rules: { [ID]: ['error', { exemptPaths: ['src/'] }] } } as never)).toBe(0)
  })

  it('REFUSES an exemptPaths that is not an array, and says so', () => {
    // Config is user-written JSON, and `"exemptPaths": "src/a.tsx"` instead of
    // `["src/a.tsx"]` is the natural typo. Two readings are dangerous and one
    // is right: silently exempting everything (the rule is off and the config
    // says it is on), or silently exempting nothing (the exemption the user
    // wrote never applies). The rule is dropped AND the reason is named, so
    // neither state is silent.
    const { res, diagnostics } = run({
      rules: { [ID]: ['error', { exemptPaths: 'src/a.tsx' }] },
    } as never)
    expect(diagnostics.filter((d) => d.ruleId === ID)).toHaveLength(0)
    const cd = res.configDiagnostics.find((d) => d.ruleId === ID)
    expect(cd, 'a config diagnostic, not silence').toBeDefined()
    expect(cd?.message).toContain('exemptPaths')
    expect(cd?.message, 'and it names the type it got').toContain('string')
  })
})

describe('why-off explains a rule that will not run', () => {
  it('reports willRun for a rule that IS on', () => {
    const s = explainRuleState(ID, { config: { rules: { [ID]: 'error' } }, filePath: join(root, 'src/a.tsx') })
    expect(s.found).toBe(true)
    expect(s.willRun).toBe(true)
    expect(s.severity).toBe('error')
  })

  it('names `off` as the reason when the rule is off', () => {
    const s = explainRuleState(ID, { config: { rules: { [ID]: 'off' } } })
    expect(s.willRun).toBe(false)
    expect(s.reasons.length).toBeGreaterThan(0)
  })

  it('treats an ABSENT entry as off rather than crashing', () => {
    // The commonest state by far — the rule is simply not in the config — and
    // the one where reading `entry[0]` off undefined would take the command
    // down instead of explaining anything.
    const s = explainRuleState(ID, { config: { rules: {} } })
    expect(s.found).toBe(true)
    expect(s.severity).toBe('off')
    expect(s.willRun).toBe(false)
  })

  it('reads the severity out of a TUPLE entry', () => {
    const s = explainRuleState(ID, { config: { rules: { [ID]: ['warn', {}] } as never } })
    expect(s.severity).toBe('warn')
  })

  it('reports configured exemptPaths without evaluating them', () => {
    // The command's job is to show the reader what is configured. Applying the
    // paths here would answer a different question than the one asked.
    const s = explainRuleState(ID, {
      config: { rules: { [ID]: ['error', { exemptPaths: ['src/x'] }] } as never },
    })
    expect(s.exemptPaths).toEqual(['src/x'])
  })

  it('returns an empty exemptPaths for a bare entry', () => {
    const s = explainRuleState(ID, { config: { rules: { [ID]: 'error' } } })
    expect(s.exemptPaths).toEqual([])
  })

  it('SUGGESTS near ids for an unknown rule', () => {
    // A typo'd id in a config is silent — the rule it was meant to disable
    // keeps running. The suggestion is the only thing that turns that into a
    // fixable message.
    const s = explainRuleState('no-positive-tabindexx', { config: { rules: {} } })
    expect(s.found).toBe(false)
    expect(s.suggestions.length).toBeGreaterThan(0)
    expect(s.suggestions.some((x) => x.includes('tabindex'))).toBe(true)
  })

  it('accepts an id with or without the `pyreon/` prefix', () => {
    const withPrefix = explainRuleState(ID, { config: { rules: { [ID]: 'error' } } })
    const without = explainRuleState('no-positive-tabindex', {
      config: { rules: { [ID]: 'error' } },
    })
    expect(without.ruleId).toBe(withPrefix.ruleId)
    expect(without.willRun).toBe(withPrefix.willRun)
  })

  it('formats a state into something a reader can act on', () => {
    const s = explainRuleState(ID, { config: { rules: { [ID]: 'off' } } })
    const out = formatRuleState(s)
    expect(out).toContain(ID)
    expect(out.length).toBeGreaterThan(0)
  })

  it('formats the UNKNOWN-rule state with its suggestions', () => {
    const s = explainRuleState('no-positive-tabindexx', { config: { rules: {} } })
    expect(formatRuleState(s)).toMatch(/tabindex/i)
  })
})

describe('suppression comments', () => {
  const withSource = (src: string): number => {
    const f = join(root, 'sup', 's.tsx')
    mkdirSync(join(root, 'sup'), { recursive: true })
    writeFileSync(f, src)
    const n = count({ rules: { [ID]: 'error' } } as never, [f])
    rmSync(f, { force: true })
    return n
  }

  it('reports without a suppression — the control', () => {
    expect(withSource(`export const S = () => <div tabIndex={3} />\n`)).toBeGreaterThan(0)
  })

  it('suppresses with a bare directive on the previous line', () => {
    expect(
      withSource(`// pyreon-lint-ignore\nexport const S = () => <div tabIndex={3} />\n`),
    ).toBe(0)
  })

  it('suppresses with the rule NAMED', () => {
    expect(
      withSource(`// pyreon-lint-ignore ${ID}\nexport const S = () => <div tabIndex={3} />\n`),
    ).toBe(0)
  })

  it('does NOT suppress when a DIFFERENT rule is named', () => {
    // A directive that silences everything regardless of the id would make
    // every targeted suppression a blanket one.
    expect(
      withSource(`// pyreon-lint-ignore pyreon/no-autofocus\nexport const S = () => <div tabIndex={3} />\n`),
    ).toBeGreaterThan(0)
  })

  it('suppresses on the FIRST line of a file', () => {
    // The previous-line lookup goes negative here; reading `lines[-1]` would
    // be undefined and the guard is what stops it throwing.
    expect(
      withSource(`// pyreon-lint-ignore\nexport const S = () => <div tabIndex={3} />\n`),
    ).toBe(0)
  })

  it('does not suppress from a line further UP', () => {
    // Directive scope is one line, deliberately — otherwise a comment at the
    // top of a file silences the whole file with no indication.
    expect(
      withSource(
        `// pyreon-lint-ignore\nconst x = 1\nexport const S = () => <div tabIndex={3} />\n`,
      ),
    ).toBeGreaterThan(0)
  })
})
