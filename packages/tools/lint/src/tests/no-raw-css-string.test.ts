/**
 * `pyreon/no-raw-css-string`: raw CSS text in an `@pyreon/elements` `css` /
 * slot-css prop (an error: nothing checks it). The type rejects a string, but
 * `h()`, an `as` cast and `.attrs({ css })` still let one through.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { noRawCssString } from '../rules/styling/no-raw-css-string'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const ID = 'pyreon/no-raw-css-string'
const CONFIG: LintConfig = { rules: { [ID]: 'error' } }

function mkProject(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-raw-css-'))
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
  lintFile(join(dir, 'src/a.tsx'), source, [noRawCssString], CONFIG).diagnostics.filter((d) => d.ruleId === ID)

describe('pyreon/no-raw-css-string', () => {
  it('fires (error) on a string literal and an untagged template in JSX', () => {
    const out = findings(`export const A = () => <><Card css="color: red;" /><Card css={\`gap: \${n}px;\`} /></>`)
    expect(out).toHaveLength(2)
    expect(out[0]!.severity).toBe('error')
    expect(out[0]!.message).toContain('multiple="look"')
  })

  it('fires per raw entry inside a breakpoint object or an array, and through an `as` cast', () => {
    expect(findings(`export const A = () => <Card css={{ xs: 'a: b;', md: css\`c: d;\` }} />`)).toHaveLength(1)
    expect(findings(`export const A = () => <Card css={['a: b;', 'c: d;']} />`)).toHaveLength(2)
    expect(findings(`export const A = () => <Card css={'a: b;' as never} />`)).toHaveLength(1)
  })

  it('fires on the slot props, h() and .attrs()', () => {
    expect(findings(`export const A = () => <Card contentCss="a: b;" beforeContentCss="c: d;" afterContentCss="e: f;" />`)).toHaveLength(3)
    expect(findings(`import { h } from '@pyreon/core'\nexport const A = () => h(Card, { css: 'a: b;' })`)).toHaveLength(1)
    expect(findings(`export const Chip = el.attrs({ tag: 'span', css: 'display:inline-flex;' })`)).toHaveLength(1)
  })

  it('does not fire on the tagged-template escape hatch, a callback, or a variable', () => {
    expect(findings(`export const A = () => <Card css={css\`a: b;\`} contentCss={(c) => c\`a: b;\`} />`)).toHaveLength(0)
    expect(findings(`export const A = () => <Card css={x} />`)).toHaveLength(0)
  })

  it('does not fire on HTML elements, coolgrid components, or without @pyreon/elements', () => {
    expect(findings(`export const A = () => <div css="a: b;" />`)).toHaveLength(0)
    expect(findings(`import { Col } from '@pyreon/coolgrid'\nexport const A = () => <Col css="a: b;" />`)).toHaveLength(0)
    expect(findings(`export const A = () => <Card css="a: b;" />`, withoutElements)).toHaveLength(0)
  })

  it('a suppression comment silences it', () => {
    const source = `export const A = () => (\n  // pyreon-lint-disable-next-line pyreon/no-raw-css-string\n  <Card css="a: b;" />\n)`
    expect(findings(source)).toHaveLength(0)
  })
})
