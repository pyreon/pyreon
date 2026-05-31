/**
 * PR 1 of the partial-collapse spec (`CLAUDE.md` ("Compile-time rocketstyle collapse")
 * → #1). The shared `on*`-handler-only detector — the build STARTED, not
 * just measured. The bail-reason census (`collapse-bail-census.test.ts`)
 * proved 7.8% of all `@pyreon/ui-components` call sites bail SOLELY on
 * `on*` handlers while every dimension/style prop is a string literal and
 * children are static text; `detectPartialCollapsibleShape` is the exact
 * detector that claims that subset.
 *
 * Contract under test (mirrors the conservative discipline of the full
 * `detectCollapsibleShape` — every uncertain signal bails):
 *
 *   - literal-prop + ≥1 `on[A-Z]…` handler + static-text children
 *     → { props (literals only), childrenText, handlers[] }
 *   - ZERO handlers → null  (that IS the full-collapse shape; the partial
 *     detector defers so the existing path stays byte-unchanged and the
 *     two detectors NEVER both claim a site — the load-bearing separation)
 *   - spread / non-handler `{expr}` prop / boolean attr / element child /
 *     expression child → null  (hard bail, same catalogue as full)
 *   - handler expr span (`exprStart`/`exprEnd`) slices the EXACT source
 *     of the `{...}` contents (load-bearing for PR 3's emit, which
 *     re-emits `code.slice(exprStart, exprEnd)` into `_rsCollapseH`)
 *
 * Bisect-verify (documented in the PR body): replace the body of
 * `detectPartialCollapsibleShape` with `return null` → the 4 POSITIVE
 * specs fail with `expected null to be …`; the 6 NEGATIVE specs still
 * pass (they assert null). Restore → 10/10. That asymmetry proves the
 * positive assertions are load-bearing on the handler-relaxation logic,
 * not passing for the wrong reason.
 */
import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import { detectPartialCollapsibleShape } from '../jsx'

/** Parse a JSX snippet and return its first JSXElement node (the shape
 * `tryRocketstyleCollapse` receives in production). */
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

const detect = (code: string) => detectPartialCollapsibleShape(firstJsxElement(code), 'Button')

describe('detectPartialCollapsibleShape — PR 1 (on*-handler-only subset)', () => {
  // ── POSITIVE: the partial-collapsible subset ────────────────────────────
  it('claims a literal-prop site with one handler', () => {
    const code =
      'const x = <Button state="primary" size="medium" onClick={handleClick}>Save</Button>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(r!.props).toEqual({ state: 'primary', size: 'medium' })
    expect(r!.childrenText).toBe('Save')
    expect(r!.handlers).toHaveLength(1)
    expect(r!.handlers[0]!.name).toBe('onClick')
    expect(code.slice(r!.handlers[0]!.exprStart, r!.handlers[0]!.exprEnd)).toBe('handleClick')
  })

  it('peels multiple handlers, keeps literal props out of handlers[]', () => {
    const code = 'const x = <Button state="primary" onClick={a} onPointerEnter={b}>Go</Button>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(r!.props).toEqual({ state: 'primary' })
    expect(r!.handlers.map((h) => h.name)).toEqual(['onClick', 'onPointerEnter'])
  })

  it('captures the EXACT expression span for an inline arrow handler', () => {
    const code = 'const x = <Button state="primary" onClick={() => doThing(1)}>Y</Button>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(code.slice(r!.handlers[0]!.exprStart, r!.handlers[0]!.exprEnd)).toBe('() => doThing(1)')
  })

  it('trims static-text children (parity with the full detector)', () => {
    const code = 'const x = <Button state="primary" onClick={h}>\n  Save\n</Button>'
    const r = detect(code)
    expect(r).not.toBeNull()
    expect(r!.childrenText).toBe('Save')
  })

  // ── NEGATIVE: every uncertain shape bails (null) ────────────────────────
  it('returns null for ZERO handlers (defers to the full-collapse path)', () => {
    // The load-bearing separation: a fully-literal site with no handler is
    // the EXISTING full-collapse shape — the partial detector must NOT
    // claim it, so the two never both fire on one site.
    expect(detect('const x = <Button state="primary">Save</Button>')).toBeNull()
  })

  it('returns null for a spread attribute', () => {
    expect(detect('const x = <Button {...rest} onClick={h}>X</Button>')).toBeNull()
  })

  it('returns null for a non-handler dynamic prop alongside a handler', () => {
    expect(detect('const x = <Button state={dyn} onClick={h}>X</Button>')).toBeNull()
  })

  it('returns null for a boolean attribute', () => {
    expect(detect('const x = <Button disabled onClick={h}>X</Button>')).toBeNull()
  })

  it('returns null for an element child', () => {
    expect(detect('const x = <Button onClick={h}><span /></Button>')).toBeNull()
  })

  it('returns null for an expression child', () => {
    expect(detect('const x = <Button onClick={h}>{label}</Button>')).toBeNull()
  })
})
