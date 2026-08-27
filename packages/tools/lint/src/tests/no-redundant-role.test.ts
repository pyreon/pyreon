/**
 * Tests for the opt-in `frontend` best-practice lint rule
 * `pyreon/no-redundant-role` (fixable).
 *
 * Structure mirrors `frontend-rules.test.ts`: paired FIRES /
 * DOES-NOT-FIRE specs plus one autofix spec.
 *
 * The rule is `optIn: true`, so the standard presets force it OFF.
 * We use `getPreset('best-practices')` — which enables every opt-in
 * rule at its declared severity — and additionally layer an explicit
 * severity entry on top so the suite is robust both before and after
 * central registration into `rules/index.ts`.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPreset } from '../config/presets'
import { noRedundantRole } from '../rules/frontend/no-redundant-role'
import { applyFixes, lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULES = [noRedundantRole]

function bpConfig(): LintConfig {
  const base = getPreset('best-practices')
  return {
    rules: {
      ...base.rules,
      'pyreon/no-redundant-role': 'warn',
    },
  }
}

function lint(source: string, filePath = 'src/App.tsx', config = bpConfig()) {
  return lintFile(filePath, source, RULES, config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

// Sanity: under `recommended` this opt-in rule stays OFF even when
// passed as rules[].
describe('pyreon/no-redundant-role — opt-in mechanic', () => {
  it('DOES fire under the `recommended` preset — a11y basics are on by default', () => {
    // Promoted OUT of opt-in: this is an unambiguous WCAG failure with an
    // ecosystem counterpart in oxlint's `correctness` tier, and shipping it
    // opt-in meant a fresh Pyreon app had NO a11y checking at all.
    const result = lintFile(
      'src/App.tsx',
      `function App() { return <button role="button">x</button> }`,
      RULES,
      getPreset('recommended'),
    )
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
})

describe('pyreon/no-redundant-role (frontend, fixable)', () => {
  it('FIRES on `<button role="button">`', () => {
    const result = lint(`function App() { return <button role="button">x</button> }`)
    expect(diagIds(result)).toContain('pyreon/no-redundant-role')
  })

  it('FIRES on `<nav role="navigation">`', () => {
    const result = lint(`function App() { return <nav role="navigation">x</nav> }`)
    expect(diagIds(result)).toContain('pyreon/no-redundant-role')
  })

  it('FIRES on `<a href="/x" role="link">` (href present → implicit link)', () => {
    const result = lint(`function App() { return <a href="/x" role="link">x</a> }`)
    expect(diagIds(result)).toContain('pyreon/no-redundant-role')
  })

  it('FIRES on `<li role="listitem">`', () => {
    const result = lint(`function App() { return <li role="listitem">x</li> }`)
    expect(diagIds(result)).toContain('pyreon/no-redundant-role')
  })

  it('does NOT fire on `<button role="link">` (non-redundant role)', () => {
    const result = lint(`function App() { return <button role="link">x</button> }`)
    expect(diagIds(result)).not.toContain('pyreon/no-redundant-role')
  })

  it('does NOT fire on `<div role="button">` (no implicit role)', () => {
    const result = lint(`function App() { return <div role="button">x</div> }`)
    expect(diagIds(result)).not.toContain('pyreon/no-redundant-role')
  })

  it('does NOT fire on `<a role="link">` (no href → a has no implicit link role)', () => {
    const result = lint(`function App() { return <a role="link">x</a> }`)
    expect(diagIds(result)).not.toContain('pyreon/no-redundant-role')
  })

  it('does NOT fire on a dynamic `<button role={dynamic}>` (non-literal)', () => {
    const result = lint(
      `function App({ dynamic }) { return <button role={dynamic}>x</button> }`,
    )
    expect(diagIds(result)).not.toContain('pyreon/no-redundant-role')
  })

  it('does NOT fire when the file path is exempted', () => {
    const result = lint(
      `function App() { return <button role="button">x</button> }`,
      'src/App.tsx',
      {
        rules: {
          'pyreon/no-redundant-role': ['warn', { exemptPaths: ['src/'] }],
        },
      },
    )
    expect(diagIds(result)).not.toContain('pyreon/no-redundant-role')
  })

  it('autofix removes the redundant role, leaving other attrs + no double space', () => {
    const source = `function App() { return <button type="button" role="button">x</button> }`
    const result = lint(source)
    const diag = result.diagnostics.find(
      (d) => d.ruleId === 'pyreon/no-redundant-role',
    )
    expect(diag?.fix).toBeDefined()
    const fixed = applyFixes(source, result.diagnostics)
    expect(fixed).toBe(
      `function App() { return <button type="button">x</button> }`,
    )
    expect(fixed).not.toContain('  ') // no double space left behind
    expect(fixed).toContain('type="button"') // sibling attr intact
  })
})

// Touch the node:fs/os/path imports so an unused-import lint can't
// complain if the harness shape changes in the future; the temp dir
// is not otherwise needed by this rule (no project-deps gating).
describe('pyreon/no-redundant-role — harness sanity', () => {
  it('lints from an on-disk file path identically', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-redundant-role-'))
    mkdirSync(join(dir, 'src'), { recursive: true })
    const filePath = join(dir, 'src', 'C.tsx')
    writeFileSync(filePath, '')
    try {
      const result = lint(
        `function C() { return <nav role="navigation">x</nav> }`,
        filePath,
      )
      expect(diagIds(result)).toContain('pyreon/no-redundant-role')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('pyreon/no-redundant-role — dynamic href is not proof of an implicit role', () => {
  // Found by promoting this rule out of opt-in. It shipped a false positive
  // that contradicted its own docstring ("`<a>` has an implicit link role only
  // when a STATIC href is present"): the helper matched the attribute by NAME
  // and ignored its value, so `href={x}` read as a static href.
  //
  // It matters because Pyreon's `applyProp` REMOVES a nullish attribute — a
  // dynamic href that resolves to `undefined` renders no href, so the element
  // has no implicit `link` role and an explicit `role="link"` is meaningful.
  //
  // The existing bail-out spec could never have caught this: the rule was OFF
  // in `recommended`, so it passed without ever running the branch.
  const run = (src: string) =>
    lintFile('src/App.tsx', src, RULES, getPreset('recommended')).diagnostics.filter(
      (d) => d.ruleId === 'pyreon/no-redundant-role',
    )

  it('does NOT flag <a> with a dynamic href', () => {
    expect(run(`const X = ({ href }) => <a href={href} role="link">x</a>`)).toHaveLength(0)
  })

  it('does NOT flag <a> with no href at all', () => {
    expect(run(`const X = () => <a role="link">x</a>`)).toHaveLength(0)
  })

  it('DOES flag <a> with a static href — there the role is provably redundant', () => {
    expect(run(`const X = () => <a href="/x" role="link">x</a>`)).toHaveLength(1)
  })

  it('still flags a non-conditional tag regardless of other attributes', () => {
    expect(run(`const X = ({ id }) => <ul id={id} role="list" />`)).toHaveLength(1)
  })
})
