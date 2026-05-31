/**
 * PR 2 of the dynamic-prop partial-collapse build (`CLAUDE.md` ("Compile-time rocketstyle collapse")
 * → #1 dynamic-prop bucket = 15.3% of all real-corpus sites; the
 * next-bigger bite after the just-shipped `on*`-handler partial-collapse
 * via `detectPartialCollapsibleShape` + `_rsCollapseH` + emit).
 *
 * Mirrors `detectPartialCollapsibleShape`'s "extend the bail catalogue
 * with ONE relaxation" pattern (see that detector's docstring + tests).
 * The single relaxation: a `JSXExpressionContainer` whose expression is
 * a `ConditionalExpression` with BOTH branches being `StringLiteral` is
 * acceptable as a "ternary-of-two-literals" dynamic prop. Captured as a
 * `DynamicCollapsibleProp` with cond source span + the two literal
 * values, so PR 3's resolver can pre-render BOTH values via the
 * existing SSR pipeline and PR 3's emit can dispatch via the cond.
 *
 * Contract under test:
 *
 *   - literal-prop + ONE ternary-of-two-literals + optional `on*` handlers
 *     + static-text children → { props, dynamicProp, handlers, childrenText }
 *   - ZERO ternaries (literal-only) → null (defers to full / on*-only paths)
 *   - 2+ ternaries → null (multi-axis combinatorics is separable scope)
 *   - ternary with ANY non-literal branch (template literal, identifier,
 *     non-string literal, computed expr) → null
 *   - spread / boolean attr / element child / expression child → null
 *   - cond span (`condStart`/`condEnd`) slices the EXACT source of the
 *     ternary's test expression (load-bearing for PR 3's emit, which
 *     re-emits `code.slice(condStart, condEnd)` into `_rsCollapseDyn`)
 *
 * Bisect-verify (documented in the PR body): replace the body of
 * `detectDynamicCollapsibleShape` with `return null` → the POSITIVE
 * specs fail with `expected null to be …`; the NEGATIVE specs still
 * pass. Restore → all pass. That asymmetry proves the positive
 * assertions are load-bearing on the ternary-relaxation logic.
 */
import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import { detectDynamicCollapsibleShape } from '../jsx'

function firstJsxElement(code: string): any {
  const { program } = parseSync('input.tsx', code, { sourceType: 'module', lang: 'tsx' })
  let found: any = null
  const visit = (node: any): void => {
    if (found || !node || typeof node !== 'object') return
    if (node.type === 'JSXElement') {
      found = node
      return
    }
    for (const k in node) {
      const v = node[k]
      if (Array.isArray(v)) for (const c of v) visit(c)
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v)
    }
  }
  visit(program)
  return found
}

const detect = (code: string) => detectDynamicCollapsibleShape(firstJsxElement(code), 'Button')

describe('detectDynamicCollapsibleShape — PR 2 (ternary-of-two-literals dynamic-prop subset)', () => {
  // ── POSITIVE: the dynamic-collapsible subset ────────────────────────────
  it('claims a literal-prop site with ONE ternary-of-two-literals', () => {
    const code = 'const x = <Button state={cond ? "primary" : "secondary"} size="medium">Save</Button>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(r!.props).toEqual({ size: 'medium' })
    expect(r!.childrenText).toBe('Save')
    expect(r!.handlers).toEqual([])
    expect(r!.dynamicProp.name).toBe('state')
    expect(r!.dynamicProp.valueTruthy).toBe('primary')
    expect(r!.dynamicProp.valueFalsy).toBe('secondary')
    expect(code.slice(r!.dynamicProp.condStart, r!.dynamicProp.condEnd)).toBe('cond')
  })

  it('captures the EXACT cond span for a complex condition', () => {
    // The condStart/condEnd MUST slice the original source of the test
    // expression so PR 3's emit can re-thread it into the dispatcher
    // verbatim (paren-wrapped to keep it a single expr like the
    // on*-handler emit does for arrow bodies).
    const code = 'const x = <Btn state={user.role === "admin" ? "primary" : "danger"}>Go</Btn>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(code.slice(r!.dynamicProp.condStart, r!.dynamicProp.condEnd)).toBe(
      'user.role === "admin"',
    )
  })

  it('composes with on*-handler relaxation — one ternary + one handler', () => {
    // Real-corpus shape: a Button with state={cond ? ... : ...} almost
    // always also has an onClick. PR 3's emit will route to a combined
    // helper when handlers are non-empty; this PR (detector) just
    // carries both for the dispatcher's sake.
    const code =
      'const x = <Button state={cond ? "primary" : "secondary"} onClick={go}>Save</Button>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(r!.dynamicProp.name).toBe('state')
    expect(r!.handlers.map((h) => h.name)).toEqual(['onClick'])
  })

  it('handles ternary on a non-state dim prop (size, variant, …)', () => {
    const code = 'const x = <Button size={isLarge ? "large" : "medium"}>S</Button>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(r!.dynamicProp.name).toBe('size')
    expect(r!.dynamicProp.valueTruthy).toBe('large')
    expect(r!.dynamicProp.valueFalsy).toBe('medium')
  })

  it('trims static-text children (parity with the rest of the family)', () => {
    const code =
      'const x = <Button state={c ? "a" : "b"}>\n  Save\n</Button>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(r!.childrenText).toBe('Save')
  })

  // ── NEGATIVE: every uncertain shape bails (null) ────────────────────────
  it('returns null for ZERO ternaries (defers to full / on*-only paths)', () => {
    // Load-bearing separation: a fully-literal site is the FULL-collapse
    // shape; on*-handler-only is the partial-collapse shape. The
    // dynamic-prop detector must NOT claim either, so the three
    // detectors never both/all-three fire on one site.
    expect(detect('const x = <Button state="primary">Save</Button>')).toBeNull()
    expect(detect('const x = <Button state="primary" onClick={h}>Save</Button>')).toBeNull()
  })

  it('returns null for 2+ ternaries (multi-axis combinatorics is separable scope)', () => {
    const code =
      'const x = <Button state={a ? "x" : "y"} size={b ? "small" : "large"}>S</Button>'
    expect(detect(code)).toBeNull()
  })

  it('returns null for a ternary with a NON-string-literal branch', () => {
    // TemplateLiteral, Identifier, numeric/boolean literal — none of
    // these are statically resolvable to a known dimension value.
    expect(detect('const x = <Button state={c ? `pri` : "sec"}>S</Button>')).toBeNull()
    expect(detect('const x = <Button state={c ? maybePrimary : "sec"}>S</Button>')).toBeNull()
    expect(detect('const x = <Button state={c ? "pri" : 1}>S</Button>')).toBeNull()
  })

  it('returns null for a non-ternary dynamic prop alongside literals', () => {
    // Signal-call / function-call / arbitrary expression — not statically
    // enumerable, no resolution possible.
    expect(detect('const x = <Button state={getMy()} size="medium">S</Button>')).toBeNull()
    expect(detect('const x = <Button state={sig()} size="medium">S</Button>')).toBeNull()
  })

  it('returns null for a spread attribute', () => {
    expect(detect('const x = <Button {...rest} state={c ? "a" : "b"}>X</Button>')).toBeNull()
  })

  it('returns null for a boolean attribute', () => {
    expect(detect('const x = <Button disabled state={c ? "a" : "b"}>X</Button>')).toBeNull()
  })

  it('returns null for an element child', () => {
    expect(detect('const x = <Button state={c ? "a" : "b"}><span /></Button>')).toBeNull()
  })

  it('returns null for an expression child', () => {
    expect(detect('const x = <Button state={c ? "a" : "b"}>{label}</Button>')).toBeNull()
  })
})
