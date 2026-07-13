/**
 * LT-4.1 + LT-6 regression: `no-window-in-ssr` and `no-dom-in-setup` must skip
 * TEST files — those never run during SSR and legitimately touch `window` /
 * `document` (assertions, `page.evaluate`). Consistent with the other
 * SSR/browser-API rules.
 */
import { noWindowInSsr } from '../rules/ssr/no-window-in-ssr'
import { noDomInSetup } from '../rules/lifecycle/no-dom-in-setup'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

function idsFor(rule: typeof noWindowInSsr, ruleId: string, source: string, filePath: string) {
  const cfg: LintConfig = { rules: { [ruleId]: 'warn' } }
  return lintFile(filePath, source, [rule], cfg).diagnostics.map((d) => d.ruleId)
}

describe('no-window-in-ssr — skips test files (LT-4.1)', () => {
  const R = 'pyreon/no-window-in-ssr'
  const src = `const w = window.innerWidth`
  it('FIRES in a production source file', () => {
    expect(idsFor(noWindowInSsr, R, src, 'src/app.ts')).toContain(R)
  })
  it('does NOT fire in a *.test.ts file', () => {
    expect(idsFor(noWindowInSsr, R, src, 'src/app.test.ts')).not.toContain(R)
  })
  it('does NOT fire in a *.browser.test.tsx file', () => {
    expect(idsFor(noWindowInSsr, R, src, 'src/app.browser.test.tsx')).not.toContain(R)
  })
})

describe('no-dom-in-setup — skips test files (LT-6)', () => {
  const R = 'pyreon/no-dom-in-setup'
  const src = `const el = document.querySelector('.x')`
  it('FIRES in a production source file (DOM in setup)', () => {
    expect(idsFor(noDomInSetup, R, src, 'src/Comp.tsx')).toContain(R)
  })
  it('does NOT fire in a *.test.tsx file (an assertion, not setup)', () => {
    expect(idsFor(noDomInSetup, R, src, 'src/Comp.test.tsx')).not.toContain(R)
  })
})
