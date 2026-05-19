/**
 * Compiler hardening — Round 12 (PROVEN high-impact DX gap; scoped).
 *
 * `transformJSX` does string-slice substitution (R2 prop-derived inlining,
 * R7 callback recursion, R9 element-const _mountSlot, R11 signal auto-call,
 * and template emission) and:
 *
 *   1. `TransformResult` has NO `map` field — zero sourcemap is produced.
 *   2. `@pyreon/vite-plugin`'s `transform()` hook returns `{ code, map: null }`
 *      for every .tsx/.jsx (src/index.ts ~540, ~666).
 *   3. The substitutions DO NOT preserve line counts — template emission
 *      expands a one-line `<div>{x}</div>` into a multi-line `_tpl(...)`
 *      factory (measured Δ up to +9 lines on idiomatic components).
 *
 * Net effect: every runtime error / stack frame / debugger breakpoint in a
 * Pyreon component maps to the WRONG source line (shifted by however many
 * lines the transform inserted above it), with no sourcemap to correct it —
 * app-wide, in every Pyreon project.
 *
 * NOT fixed here. Correct sourcemaps require replacing jsx.ts's
 * `code.slice`+splice with MagicString-tracked edits throughout (a
 * compiler-wide refactor) OR making every emission strictly newline-count-
 * preserving (massive template-test churn + readability loss). Either is a
 * dedicated, separately-validated PR — bolting it onto a hardening sweep is
 * exactly the over-scope the project's discipline forbids. This test PINS
 * the current behavior so it is a deliberate, visible, regression-tracked
 * decision rather than an accident: if a future change starts producing a
 * map or preserving line counts, these update deliberately.
 */
import { describe, expect, it } from 'vitest'
import type { TransformResult } from '../jsx'
import { transformJSX_JS } from '../jsx'

describe('Round 12 — sourcemap / line fidelity (pinned gap)', () => {
  it('TransformResult exposes no sourcemap field', () => {
    const r: TransformResult = transformJSX_JS(`function C(p){ return <div>{p.x}</div> }`, 'c.tsx')
    expect('map' in r).toBe(false)
    expect(r).toHaveProperty('code')
  })

  it('template emission shifts line numbers (no map to correct it)', () => {
    const src = `function C(props) {\n  return (\n    <section>\n      <h1>{props.title}</h1>\n      <p>{props.body}</p>\n    </section>\n  )\n}`
    const out = transformJSX_JS(src, 'c.tsx').code
    const inLines = src.split('\n').length
    const outLines = out.split('\n').length
    // Pinned: the transform is NOT line-count-preserving. A stack frame at
    // original line N resolves to a different line in the emitted module.
    expect(outLines).toBeGreaterThan(inLines)
  })

  it('a control with only an expression child also shifts (broad, not edge)', () => {
    const src = `function C(props) {\n  const cls = props.theme + '-x'\n  return <div class={cls}>{props.name}</div>\n}`
    const out = transformJSX_JS(src, 'c.tsx').code
    expect(out.split('\n').length).not.toBe(src.split('\n').length)
  })
})
