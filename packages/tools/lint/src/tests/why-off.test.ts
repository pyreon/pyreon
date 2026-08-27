import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'
import { explainRuleState, formatRuleState } from '../why-off'

/**
 * A rule can be inert for four independent reasons, three of which are
 * invisible in config. These specs lock that every one of them is REPORTED —
 * the failure mode being fixed is a user reading a green run and concluding
 * their code is clean when the rule never ran.
 */

let projectDir: string
function makeProject(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-whyoff-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'demo-app', dependencies: deps }),
  )
  const file = join(dir, 'src', 'App.tsx')
  writeFileSync(file, 'export const A = 1\n')
  return file
}

beforeEach(() => {
  _resetProjectDepsCache()
})
afterEach(() => {
  if (projectDir) rmSync(projectDir, { recursive: true, force: true })
  _resetProjectDepsCache()
})

const recommended = (): LintConfig => getPreset('recommended')

describe('explainRuleState', () => {
  it('accepts a bare id and normalizes it to the pyreon/ namespace', () => {
    const bare = explainRuleState('no-missing-for-by', { config: recommended() })
    const full = explainRuleState('pyreon/no-missing-for-by', { config: recommended() })
    expect(bare.ruleId).toBe('pyreon/no-missing-for-by')
    expect(bare.found).toBe(true)
    expect(bare.willRun).toBe(full.willRun)
  })

  it('reports nothing suppressing an enabled rule', () => {
    const state = explainRuleState('no-missing-for-by', { config: recommended() })
    expect(state.willRun).toBe(true)
    expect(state.severity).toBe('error')
    expect(state.reasons).toEqual([])
  })

  it('names an unknown rule and suggests the near miss', () => {
    const state = explainRuleState('no-missing-by', { config: recommended() })
    expect(state.found).toBe(false)
    expect(state.willRun).toBe(false)
    expect(state.reasons.map((r) => r.code)).toEqual(['unknown-rule'])
    expect(state.suggestions).toContain('pyreon/no-missing-for-by')
  })

  it('explains an opt-in rule as opt-in, not merely off', () => {
    // "severity is off" alone is unhelpful — it does not say WHY the default
    // is off, so the user cannot tell whether that was deliberate.
    const state = explainRuleState('rx-prefer-pipe', { config: recommended() })
    const codes = state.reasons.map((r) => r.code)
    expect(codes).toContain('severity-off')
    expect(codes).toContain('opt-in')
  })

  it('explains a monorepo-scoped rule even when the project re-enabled it', () => {
    // The scope reason describes the DEFAULT, so it is reported regardless of
    // current severity — this repo enables these by id and still needs to know
    // that a consumer would not get them.
    const config = recommended()
    config.rules['pyreon/no-circular-import'] = 'error'
    const state = explainRuleState('no-circular-import', { config })
    expect(state.willRun).toBe(true)
    expect(state.reasons.map((r) => r.code)).toContain('monorepo-scope')
  })

  it('reports a missing dependency gate — the reason no config change can fix', () => {
    projectDir = makeProject({ '@pyreon/core': '*' })
    const config = recommended()
    config.rules['pyreon/rx-prefer-pipe'] = 'info'
    const state = explainRuleState('rx-prefer-pipe', {
      config,
      filePath: projectDir,
    })
    expect(state.severity).toBe('info')
    expect(state.willRun).toBe(false)
    const dep = state.reasons.find((r) => r.code === 'dependency-missing')
    expect(dep?.detail).toContain('@pyreon/rx')
  })

  it('does not report the gate when the dependency IS declared', () => {
    projectDir = makeProject({ '@pyreon/rx': '*' })
    const config = recommended()
    config.rules['pyreon/rx-prefer-pipe'] = 'info'
    const state = explainRuleState('rx-prefer-pipe', {
      config,
      filePath: projectDir,
    })
    expect(state.reasons.map((r) => r.code)).not.toContain('dependency-missing')
    expect(state.willRun).toBe(true)
  })

  it('reports every applicable reason at once, not just the first', () => {
    // The whole point: reasons compose, so fixing one changes nothing. An
    // opt-in, dependency-gated rule in a project without the dep is off for
    // three reasons simultaneously.
    projectDir = makeProject({ '@pyreon/core': '*' })
    const state = explainRuleState('rx-prefer-pipe', {
      config: recommended(),
      filePath: projectDir,
    })
    expect(state.reasons.map((r) => r.code).sort()).toEqual([
      'dependency-missing',
      'opt-in',
      'severity-off',
    ])
  })

  it('surfaces configured exemptPaths so a silent file is explicable', () => {
    const config = recommended()
    config.rules['pyreon/no-window-in-ssr'] = ['error', { exemptPaths: ['src/legacy/'] }]
    const state = explainRuleState('no-window-in-ssr', { config })
    expect(state.exemptPaths).toEqual(['src/legacy/'])
  })

  it('every reason carries an actionable fix', () => {
    projectDir = makeProject({ '@pyreon/core': '*' })
    const states = [
      explainRuleState('rx-prefer-pipe', { config: recommended(), filePath: projectDir }),
      explainRuleState('no-circular-import', { config: recommended() }),
      explainRuleState('definitely-not-a-rule', { config: recommended() }),
    ]
    for (const s of states) {
      for (const r of s.reasons) {
        expect(r.fix.length, `${s.ruleId}/${r.code} has no fix`).toBeGreaterThan(10)
      }
    }
  })
})

describe('formatRuleState', () => {
  it('renders the will-run verdict and every reason code', () => {
    projectDir = makeProject({ '@pyreon/core': '*' })
    const out = formatRuleState(
      explainRuleState('rx-prefer-pipe', { config: recommended(), filePath: projectDir }),
    )
    expect(out).toContain('WILL NOT RUN')
    expect(out).toContain('[opt-in]')
    expect(out).toContain('[dependency-missing]')
    expect(out).toContain('fix:')
  })

  it('renders did-you-mean for an unknown rule', () => {
    const out = formatRuleState(explainRuleState('no-missing-by', { config: recommended() }))
    expect(out).toContain('unknown rule')
    expect(out).toContain('pyreon/no-missing-for-by')
  })
})

describe('requiresDependency declarations', () => {
  it('matches the gate each rule actually performs', async () => {
    // The declaration exists so tooling can EXPLAIN the gate; if it drifts
    // from the `isProjectDependency(...)` call in the rule body, `--why-off`
    // reports a dependency the rule never checks.
    const { readFileSync } = await import('node:fs')
    const { join: j } = await import('node:path')
    const mismatches: string[] = []
    for (const rule of allRules) {
      const declared = rule.meta.requiresDependency
      if (!declared) continue
      const parts = rule.meta.id.replace('pyreon/', '')
      const file = j(
        import.meta.dirname,
        '..',
        'rules',
        rule.meta.category,
        `${parts}.ts`,
      )
      let src: string
      try {
        src = readFileSync(file, 'utf8')
      } catch {
        continue // filename does not match the id; covered elsewhere
      }
      if (!src.includes(`'${declared}'`)) {
        mismatches.push(`${rule.meta.id} declares ${declared}, source never mentions it`)
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([])
  })

  it('every dependency-gated rule declares its dependency', async () => {
    const { readFileSync } = await import('node:fs')
    const { join: j } = await import('node:path')
    const undeclared: string[] = []
    for (const rule of allRules) {
      const parts = rule.meta.id.replace('pyreon/', '')
      const file = j(import.meta.dirname, '..', 'rules', rule.meta.category, `${parts}.ts`)
      let src: string
      try {
        src = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      if (!src.includes('isProjectDependency')) continue
      if (rule.meta.requiresDependency) continue
      // `prefer-isserver` gates on EITHER `@pyreon/core` or `@pyreon/reactivity`,
      // which a single-value field cannot express. Pinned as the one exception
      // so the list can only shrink.
      if (rule.meta.id === 'pyreon/prefer-isserver') continue
      undeclared.push(rule.meta.id)
    }
    expect(undeclared, `dependency-gated but undeclared:\n${undeclared.join('\n')}`).toEqual([])
  })
})
