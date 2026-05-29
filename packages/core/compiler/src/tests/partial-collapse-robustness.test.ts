/**
 * Compiler hardening — Round 8 (robustness gate; no bug found).
 *
 * The partial-collapse emit path (#683 `tryPartialCollapse` →
 * `__rsCollapseH(...)`, runtime #681, e2e #684) shipped with a happy-path
 * emission test only. This adversarial gate locks its SAFETY contract under
 * inputs that must BAIL or emit cleanly — never throw, never emit
 * un-parseable JS: handlers with commas/ternaries/nested-braces/JSX-in-body/
 * template-literals/signal-closures, multi-handler, dynamic non-handler prop,
 * spread, `onClick={undefined}`, and key-miss. All currently pass (the path
 * is robust); this prevents a future regression in the new code from silently
 * shipping broken collapsed output.
 */
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { rocketstyleCollapseKey, transformJSX } from '../jsx'

const SITE = {
  templateHtml: '<button><span>Save</span></button>',
  lightClass: 'L',
  darkClass: 'D',
  rules: ['.L{}'],
  ruleKey: 'b',
}
const opt = (sites: Record<string, typeof SITE>) => ({
  collapseRocketstyle: {
    candidates: new Set(['Button']),
    sites: new Map(Object.entries(sites)),
    mode: { name: 'useMode', source: '@pyreon/ui-core' },
  },
})
const reparses = (c: string): boolean => {
  try {
    return !parseSync('o.tsx', c).errors?.length
  } catch {
    return false
  }
}

const CASES: Array<[string, string, Record<string, string>]> = [
  [
    'multi-handler',
    `const x = <Button state="primary" onClick={a} onPointerEnter={b}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'arrow-with-commas',
    `const x = <Button state="primary" onClick={() => f(a, b, c)}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'ternary-handler',
    `const x = <Button state="primary" onClick={cond ? h1 : h2}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'nested-braces-handler',
    `const x = <Button state="primary" onClick={() => { const o = {a:1}; g(o) }}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'signal-closure-handler',
    `const x = <Button state="primary" onClick={() => s.set(s() + 1)}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'jsx-in-handler-body',
    `const x = <Button state="primary" onClick={() => render(<i/>)}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'template-literal-in-handler',
    `const x = <Button state="primary" onClick={() => log(\`v=\${y}\`)}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'dynamic-non-handler-prop-bails',
    `const x = <Button state={dyn} onClick={h}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'spread-bails',
    `const x = <Button state="primary" {...rest} onClick={h}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'onClick-undefined',
    `const x = <Button state="primary" onClick={undefined}>Save</Button>`,
    { state: 'primary' },
  ],
  [
    'key-miss-no-collapse',
    `const x = <Button state="primary" onClick={h}>Save</Button>`,
    { size: 'x' },
  ],
]

describe('Round 8 — partial-collapse emit is robust (never throws / never emits broken JS)', () => {
  for (const [name, src, props] of CASES) {
    it(name, () => {
      const key = rocketstyleCollapseKey('Button', props, 'Save')
      let code = ''
      let threw: unknown = null
      try {
        code = transformJSX(src, 'App.tsx', opt({ [key]: SITE })).code ?? ''
      } catch (e) {
        threw = e
      }
      expect(threw, `partial-collapse must not throw on: ${src}`).toBeNull()
      expect(reparses(code), `partial-collapse must emit parseable JS for: ${src}`).toBe(true)
    })
  }
})
