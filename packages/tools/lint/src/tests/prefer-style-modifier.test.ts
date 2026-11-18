/**
 * `pyreon/prefer-style-modifier`: the `css` escape hatch on a component in an
 * `@pyreon/elements` project, where a one-off look is a named `.multiple()`
 * modifier. Paired fires / does-not-fire cases through the real rule runner,
 * the false positives the rule must skip, the suggestion snippet, and the
 * dependency gate.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { preferStyleModifier } from '../rules/styling/prefer-style-modifier'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const ID = 'pyreon/prefer-style-modifier'
const CONFIG: LintConfig = { rules: { [ID]: 'warn' } }

function mkProject(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-style-modifier-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', dependencies: deps }))

  return dir
}

let withElements = ''
let withoutElements = ''

beforeAll(() => {
  _resetProjectDepsCache()
  withElements = mkProject({ '@pyreon/elements': '*' })
  withoutElements = mkProject({ '@emotion/react': '*' })
})

afterAll(() => {
  rmSync(withElements, { recursive: true, force: true })
  rmSync(withoutElements, { recursive: true, force: true })
})

const findings = (source: string, dir = withElements) =>
  lintFile(join(dir, 'src/a.tsx'), source, [preferStyleModifier], CONFIG).diagnostics.filter((d) => d.ruleId === ID)

describe('pyreon/prefer-style-modifier', () => {
  it('fires on css on a JSX component; the message carries the modifier snippet built from the declarations', () => {
    const out = findings(
      `import { css } from '@pyreon/styler'\nexport const A = () => <Grid css={css\`grid-template-columns: repeat(3, 1fr); gap: 8px;\`} />`,
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.severity).toBe('warn')
    expect(out[0]!.message).toContain("Grid.multiple({ look: { gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' } })")
    expect(out[0]!.message).toContain('<Styled multiple="look" />')
  })

  it('a css with a selector gets the generic modifier snippet; both snippets are always offered', () => {
    const out = findings(`export const A = () => <Card css={css\`&:hover { color: red; }\`} />`)
    expect(out).toHaveLength(1)
    expect(out[0]!.message).toContain('Card.multiple({ look: { /* the declarations, as .theme() keys */ } })')
    expect(out[0]!.message).toContain('Card.params({ value: (v: number) =>')
    expect(out[0]!.message.indexOf('.multiple(')).toBeLessThan(out[0]!.message.indexOf('.params('))
  })

  it('a css that interpolates a value (or is a callback) puts the param snippet first', () => {
    for (const src of [
      `export const A = (p) => <Grid css={css\`grid-template-columns: repeat(\${p.n}, 1fr);\`} />`,
      `export const A = () => <Grid css={(c) => c\`gap: 8px;\`} />`,
    ]) {
      const [d] = findings(src)
      expect(d!.message.indexOf('.params(')).toBeLessThan(d!.message.indexOf('.multiple('))
    }
  })

  it('fires on a member-expression component', () => {
    expect(findings(`export const A = () => <Ui.Card css={x} />`)).toHaveLength(1)
  })

  it('fires on h(Component, { css })', () => {
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h(Card, { css: x })`)).toHaveLength(1)
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h(Card, { 'css': x })`)).toHaveLength(1)
  })

  it('does not fire on a modifier list', () => {
    expect(findings(`export const A = () => <Grid multiple={['threeUp', on && 'dense']} />`)).toHaveLength(0)
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h(Grid, { multiple: 'threeUp' })`)).toHaveLength(0)
  })

  it('leaves a raw string to pyreon/no-raw-css-string (no double report)', () => {
    expect(findings(`export const A = () => <Card css="color: red;" />`)).toHaveLength(0)
    expect(findings(`export const A = () => <Card css={{ md: 'color: red;' }} />`)).toHaveLength(0)
  })

  it('does not fire on an HTML element', () => {
    expect(findings(`export const A = () => <div css={x} />`)).toHaveLength(0)
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h('div', { css: x })`)).toHaveLength(0)
  })

  it('does not fire on @pyreon/coolgrid components (no theme to put a modifier on)', () => {
    const source = `import { Container as Box, Row } from '@pyreon/coolgrid'\nexport const A = () => <Box css={x}><Row css={y} /></Box>`
    expect(findings(source)).toHaveLength(0)
  })

  it('does not fire on the slot css props (a root modifier cannot reach a slot) or a css key elsewhere', () => {
    expect(findings(`export const A = () => <Card contentCss={x} beforeContentCss={y} afterContentCss={z} />`)).toHaveLength(0)
    expect(findings(`const theme = { css: 'x' }\nexport const A = () => other(Card, { css: x })`)).toHaveLength(0)
  })

  it('stays silent in a project without @pyreon/elements (e.g. an Emotion css prop)', () => {
    expect(findings(`export const A = () => <Card css={x} />`, withoutElements)).toHaveLength(0)
  })

  it('a suppression comment silences a deliberate escape hatch', () => {
    const source = `export const A = () => (\n  // a selector a theme value cannot express\n  // pyreon-lint-disable-next-line pyreon/prefer-style-modifier\n  <Card css={x} />\n)`
    expect(findings(source)).toHaveLength(0)
  })
})
