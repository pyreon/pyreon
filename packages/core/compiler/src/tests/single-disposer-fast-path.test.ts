import { describe, expect, it } from 'vitest'

import { transformJSX } from '../jsx'

// Perf regression gate for the single-binding disposer fast path.
//
// A template's `_tpl(html, (__root) => { …; return <cleanup> })` callback used
// to ALWAYS wrap its disposers in a fresh closure: `return () => { __d0() }`.
// For a template with exactly ONE binding that closure is pure overhead — one
// allocation + one retained scope per template INSTANCE (i.e. per row under a
// keyed `<For>`). The fast path returns the single disposer DIRECTLY (`return
// __d0`), which is equivalent because `_bind`/`_bindText`/`_bindDirect` always
// return a disposer function (never null — see runtime-dom/template.ts).
//
// `transformJSX` exercises the SHIPPED backend (native binary by default, JS
// fallback otherwise); native↔JS byte-parity for these shapes is locked
// separately in native-equivalence.test.ts.

const code = (src: string): string => transformJSX(src, 'input.tsx').code
const SIG = `import { signal } from '@pyreon/reactivity'\nconst t = signal(0); const c = signal(1)\n`

describe('compiler — single-disposer fast path', () => {
  it('a single-binding template returns the disposer directly (no wrapper closure)', () => {
    // Multi-element tree → template-izes; one reactive text child → one disposer.
    const out = code(`${SIG}export const A = () => <div class="row"><span>{t()}</span></div>`)
    expect(out).toContain('return __d0')
    // the per-instance wrapper closure must be gone
    expect(out).not.toMatch(/return \(\) => \{ __d0\(\) \}/)
  })

  it('a multi-binding template still wraps all disposers in one closure', () => {
    const out = code(
      `${SIG}export const B = () => <div class="row"><span>{t()}</span><span>{c()}</span></div>`,
    )
    expect(out).toMatch(/return \(\) => \{ __d0\(\); __d1\(\) \}/)
    // must NOT degrade to returning a single disposer when there are two
    expect(out).not.toMatch(/return __d0\b(?! *\(\))/)
  })

  it('a binding-free template returns null (no closure either)', () => {
    const out = code(`export const C = () => <div class="row"><span>static</span></div>`)
    // fully static → baked to HTML, no bindings; the _tpl callback (if emitted)
    // returns null, never a wrapper closure.
    expect(out).not.toMatch(/return \(\) => \{/)
  })
})
