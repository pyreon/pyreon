/**
 * `pyreon/prefer-styles-prop`: the `css` escape hatch on a component in an
 * `@pyreon/elements` project, where the typed `styles` override exists.
 * Paired fires / does-not-fire cases, the false positives the rule must skip,
 * and the dependency gate.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { preferStylesProp } from '../rules/styling/prefer-styles-prop'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const ID = 'pyreon/prefer-styles-prop'
const CONFIG: LintConfig = { rules: { [ID]: 'warn' } }

function mkProject(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-styles-prop-'))
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
  lintFile(join(dir, 'src/a.tsx'), source, [preferStylesProp], CONFIG).diagnostics.filter((d) => d.ruleId === ID)

describe('pyreon/prefer-styles-prop', () => {
  it('fires on css on a JSX component, with the typed alternative in the message', () => {
    const out = findings(`import { css } from '@pyreon/styler'\nexport const A = () => <Card css={css\`color: red;\`} />`)
    expect(out).toHaveLength(1)
    expect(out[0]!.severity).toBe('warn')
    expect(out[0]!.message).toContain('styles={{')
  })

  it('fires on a member-expression component and a callback css', () => {
    expect(findings(`export const A = () => <Ui.Card css={(c) => c\`color: red;\`} />`)).toHaveLength(1)
  })

  it('fires on h(Component, { css })', () => {
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h(Card, { css: x })`)).toHaveLength(1)
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h(Card, { 'css': x })`)).toHaveLength(1)
  })

  it('does not fire on the typed styles prop', () => {
    expect(findings(`export const A = () => <Card styles={{ color: 'red' }} />`)).toHaveLength(0)
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h(Card, { styles: { color: 'red' } })`)).toHaveLength(0)
  })

  it('does not fire on an HTML element', () => {
    expect(findings(`export const A = () => <div css={x} />`)).toHaveLength(0)
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h('div', { css: x })`)).toHaveLength(0)
  })

  it('does not fire on @pyreon/coolgrid components (no typed override there)', () => {
    const source = `import { Container as Box, Row } from '@pyreon/coolgrid'\nexport const A = () => <Box css={x}><Row css={y} /></Box>`
    expect(findings(source)).toHaveLength(0)
  })

  it('does not fire on the slot css props or a css key elsewhere', () => {
    expect(findings(`export const A = () => <Card contentCss={x} beforeContentCss={y} afterContentCss={z} />`)).toHaveLength(0)
    expect(findings(`const theme = { css: 'x' }\nexport const A = () => other(Card, { css: x })`)).toHaveLength(0)
  })

  it('stays silent in a project without @pyreon/elements (e.g. an Emotion css prop)', () => {
    expect(findings(`export const A = () => <Card css={x} />`, withoutElements)).toHaveLength(0)
  })

  it('a suppression comment silences a deliberate escape hatch', () => {
    const source = `export const A = () => (\n  // selector the typed override cannot express\n  // pyreon-lint-ignore pyreon/prefer-styles-prop\n  <Card css={x} />\n)`
    expect(findings(source)).toHaveLength(0)
  })
})
