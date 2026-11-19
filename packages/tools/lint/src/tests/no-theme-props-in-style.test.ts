/**
 * `pyreon/no-theme-props-in-style` (opt-in): an inline `style` on a
 * rocketstyle / Element component that fixes a layout or theme-owned
 * property. Precise by construction: only known-themeable components, only
 * literal values.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { noThemePropsInStyle } from '../rules/styling/no-theme-props-in-style'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'
import { _resetProjectDepsCache } from '../utils/project-deps'

const ID = 'pyreon/no-theme-props-in-style'
const CONFIG: LintConfig = { rules: { [ID]: 'warn' } }

function mkProject(deps: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-theme-style-'))
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
  lintFile(join(dir, 'src/a.tsx'), source, [noThemePropsInStyle], CONFIG).diagnostics.filter((d) => d.ruleId === ID)

describe('pyreon/no-theme-props-in-style', () => {
  it('fires on an imported Element / ui-components component with a literal theme-owned value', () => {
    const out = findings(`import { Element } from '@pyreon/elements'\nexport const A = () => <Element style={{ padding: 4, color: 'red' }} />`)
    expect(out).toHaveLength(1)
    expect(out[0]!.message).toContain('`padding`, `color`')
    expect(findings(`import { Card } from '@pyreon/ui-components'\nexport const A = () => <Card style={{ display: 'grid' }} />`)).toHaveLength(1)
  })

  it('fires on a rocketstyle chain declared in the file', () => {
    const source = `const Card = el.config({ name: 'Card' }).theme(() => ({}))\nexport const A = () => <Card style={{ gap: \`8px\` }} />`
    expect(findings(source)).toHaveLength(1)
  })

  it('does not fire on computed values, custom properties, or properties the theme does not own', () => {
    const imp = `import { Element } from '@pyreon/elements'\n`
    expect(findings(`${imp}export const A = () => <Element style={{ transform: \`translateX(\${x()}px)\`, width: w() }} />`)).toHaveLength(0)
    expect(findings(`${imp}export const A = () => <Element style={{ '--min': '240px', transform: 'none' }} />`)).toHaveLength(0)
    expect(findings(`${imp}export const A = () => <Element style={{ padding: pad() }} />`)).toHaveLength(0)
  })

  it('does not fire on an unknown component, an HTML element, or without @pyreon/elements', () => {
    expect(findings(`import { Stack } from '@pyreon/primitives'\nexport const A = () => <Stack style={{ padding: 4 }} />`)).toHaveLength(0)
    expect(findings(`export const A = () => <div style={{ padding: 4 }} />`)).toHaveLength(0)
    expect(findings(`import { Element } from '@pyreon/elements'\nexport const A = () => <Element style={{ padding: 4 }} />`, withoutElements)).toHaveLength(0)
  })

  it('is opt-in (off unless asked for)', () => {
    expect(noThemePropsInStyle.meta.optIn).toBe(true)
  })

  it('a suppression comment silences it', () => {
    const source = `import { Element } from '@pyreon/elements'\nexport const A = () => (\n  // pyreon-lint-disable-next-line pyreon/no-theme-props-in-style\n  <Element style={{ padding: 4 }} />\n)`
    expect(findings(source)).toHaveLength(0)
  })
})
