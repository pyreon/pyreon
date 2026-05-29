/**
 * P0 element-child collapse — PR 2, the compiler EMIT half.
 * `tryRocketstyleCollapse` falls through to `tryElementChildCollapse`
 * when FULL / partial / dynamic all bail. Because the resolver
 * SSR-renders the REAL component WITH its child subtree and bakes the
 * full output HTML, the emit is the UNCHANGED `__rsCollapse(...)` — NO
 * new runtime helper (unlike partial's `_rsCollapseH` / dynamic's
 * `_rsCollapseDyn`). The cloned template already contains the children.
 *
 * Mirrors the partial/dynamic emit-test harness (stubbed resolved-`sites`
 * map — the resolver + plugin scan are the CI-exercised half; this
 * proves the emit contract in isolation). Keys are computed via the real
 * `detectElementChildCollapsibleShape` so the test key matches exactly
 * what the compiler computes internally (serialized child subtree).
 *
 * Bisect-verify (PR body): revert the `|| tryElementChildCollapse(...)`
 * arm in `tryRocketstyleCollapse` → the element-child specs fail
 * (`__rsCollapse(` absent, normal mount kept) while the FULL-collapse
 * regression spec still passes (the fallback is the only delta).
 */
import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import { detectElementChildCollapsibleShape, rocketstyleCollapseKey, transformJSX } from '../jsx'

const SITE = {
  // Resolver bakes the FULL subtree (root class stripped) — the child
  // <div> is part of the template, not re-attached at runtime.
  templateHtml: '<div data-progress="1"><div style="width:60%;height:100%"></div></div>',
  lightClass: 'pyr-L1 pyr-L2',
  darkClass: 'pyr-D1 pyr-D2',
  rules: ['.pyr-L1{color:red}', '.pyr-D1{color:blue}'],
  ruleKey: 'bundleE',
}

function collapseOpt(candidates: string[], sites: Record<string, typeof SITE>) {
  return {
    collapseRocketstyle: {
      candidates: new Set(candidates),
      sites: new Map(Object.entries(sites)),
      mode: { name: 'useMode', source: '@pyreon/ui-core' },
    },
  }
}

/** Parse a JSX snippet → its first JSXElement (what the compiler sees). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstJsxElement(code: string): any {
  const { program } = parseSync('input.tsx', code, { sourceType: 'module', lang: 'tsx' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let found: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (n: any): void => {
    if (found || !n || typeof n !== 'object') return
    if (n.type === 'JSXElement') {
      found = n
      return
    }
    for (const k in n) {
      const v = n[k]
      if (Array.isArray(v)) for (const c of v) visit(c)
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v)
    }
  }
  visit(program)
  return found
}

/** Compute the element-child collapse key the compiler will look up. */
function elemKey(tag: string, src: string): string {
  const node = firstJsxElement(src)
  const elem = detectElementChildCollapsibleShape(node, tag)
  if (!elem) throw new Error('detector did not match — fix the fixture')
  return rocketstyleCollapseKey(tag, elem.props, elem.childrenKey)
}

describe('compiler — element-child collapse emission', () => {
  it('emits the UNCHANGED __rsCollapse for a static-element-child site', () => {
    const inner =
      '<Progress state="primary" size="medium"><div style="width:60%;height:100%" /></Progress>'
    const src = `const x = ${inner}`
    const key = elemKey('Progress', inner)
    const { code } = transformJSX(src, 'App.tsx', collapseOpt(['Progress'], { [key]: SITE }))

    expect(code).toContain(
      '__rsCollapse("<div data-progress=\\"1\\"><div style=\\"width:60%;height:100%\\"></div></div>", ' +
        '"pyr-L1 pyr-L2", "pyr-D1 pyr-D2", () => __pyrMode() === "dark")',
    )
    // NO new runtime helper — the baked template already has the child.
    expect(code).not.toContain('__rsCollapseH(')
    expect(code).not.toContain('__rsCollapseDyn(')
    // Only `_rsCollapse` is imported (no H / Dyn variant).
    expect(code).toContain('_rsCollapse as __rsCollapse')
    expect(code).not.toContain('_rsCollapseH as')
    // Idempotent rule injection, same as every collapse path.
    expect(code).toContain('__rsSheet.injectRules(')
    expect(code).toContain('"bundleE"')
  })

  it('collapses a multi-child static subtree (text + element siblings)', () => {
    const inner = '<Paragraph size="small">Press <kbd>Enter</kbd> now</Paragraph>'
    const src = `const x = ${inner}`
    const key = elemKey('Paragraph', inner)
    const { code } = transformJSX(src, 'M.tsx', collapseOpt(['Paragraph'], { [key]: SITE }))
    expect(code).toContain('__rsCollapse(')
    expect(code).not.toContain('__rsCollapseH(')
  })

  it('keeps the normal mount when the key is unresolved (resolver bailed)', () => {
    const inner = '<Progress state="primary"><div style="x" /></Progress>'
    const src = `const x = ${inner}`
    // collapseOpt with NO matching site → must NOT collapse.
    const { code } = transformJSX(src, 'U.tsx', collapseOpt(['Progress'], {}))
    expect(code).not.toContain('__rsCollapse(')
  })

  it('does NOT claim a component-child site (bails, normal mount)', () => {
    // <Card><Header/></Card> — component child → detector bails → no
    // element-child collapse even if a (wrong) site were present.
    const inner = '<Card variant="x"><Header /></Card>'
    const src = `const x = ${inner}`
    // Build a bogus site under SOME key; the detector won't produce this
    // key, so no collapse.
    const { code } = transformJSX(src, 'C.tsx', collapseOpt(['Card'], { someKey: SITE }))
    expect(code).not.toContain('__rsCollapse(')
  })

  it('FULL-collapse path byte-unchanged (regression): text-only site still plain __rsCollapse', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Save')
    const src = 'const x = <Button state="primary">Save</Button>'
    const { code } = transformJSX(src, 'F.tsx', collapseOpt(['Button'], { [key]: SITE }))
    expect(code).toContain('__rsCollapse(')
    expect(code).not.toContain('__rsCollapseH(')
  })
})
