/**
 * P0 element-child collapse — PR 2, the plugin-SCAN half.
 * `scanCollapsibleSites` expands static-element-child sites into the
 * resolve set so the plugin's resolver pre-renders them. The site
 * carries `childTree` (for the resolver to rebuild via `h()`) and
 * `childrenText` = `serializeStaticChildren(childTree)` (the cache /
 * key discriminator). The key MUST equal what the compiler emit
 * (`tryElementChildCollapse`) looks up — the scan↔emit invariant.
 *
 * Bisect-verify (PR body): revert the element-child fallthrough in
 * `scanCollapsibleSites` → these specs fail (no site emitted for a
 * static-element-child shape) while the full/dynamic scan specs still
 * pass.
 */
import { describe, expect, it } from 'vitest'
import { parseSync } from 'oxc-parser'
import {
  detectElementChildCollapsibleShape,
  rocketstyleCollapseKey,
  scanCollapsibleSites,
} from '../jsx'

const SRC = new Set(['@pyreon/ui-components'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstJsxElement(code: string): any {
  const { program } = parseSync('input.tsx', code, { sourceType: 'module', lang: 'tsx' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let found: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (n: any): void => {
    if (found || !n || typeof n !== 'object') return
    if (n.type === 'JSXElement') { found = n; return }
    for (const k in n) {
      const v = n[k]
      if (Array.isArray(v)) for (const c of v) visit(c)
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v)
    }
  }
  visit(program)
  return found
}

describe('scanCollapsibleSites — element-child', () => {
  it('emits ONE site with childTree + serialized childrenText for a static-element-child shape', () => {
    const code = [
      "import { Progress } from '@pyreon/ui-components'",
      'const x = <Progress state="primary" size="medium"><div style="width:60%" /></Progress>',
    ].join('\n')
    const sites = scanCollapsibleSites(code, 'App.tsx', SRC)
    expect(sites).toHaveLength(1)
    const s = sites[0]!
    expect(s.componentName).toBe('Progress')
    expect(s.importedName).toBe('Progress')
    expect(s.source).toBe('@pyreon/ui-components')
    expect(s.props).toEqual({ state: 'primary', size: 'medium' })
    // childTree carries the recursively-static subtree for the resolver.
    expect(s.childTree).toEqual([
      { tag: 'div', props: { style: 'width:60%' }, children: [] },
    ])
    // The key matches what the compiler emit computes (scan↔emit invariant).
    const node = firstJsxElement(
      '<Progress state="primary" size="medium"><div style="width:60%" /></Progress>',
    )
    const elem = detectElementChildCollapsibleShape(node, 'Progress')!
    expect(s.key).toBe(rocketstyleCollapseKey('Progress', elem.props, elem.childrenKey))
    expect(s.childrenText).toBe(elem.childrenKey)
  })

  it('does NOT emit a site for a component-child shape', () => {
    const code = [
      "import { Card } from '@pyreon/ui-components'",
      "import { Header } from './header'",
      'const x = <Card variant="x"><Header /></Card>',
    ].join('\n')
    expect(scanCollapsibleSites(code, 'C.tsx', SRC)).toHaveLength(0)
  })

  it('does NOT emit for a dynamic-prop + element-child shape (root prop bails)', () => {
    const code = [
      "import { Progress } from '@pyreon/ui-components'",
      'const x = <Progress state={s}><div style="x" /></Progress>',
    ].join('\n')
    // state={s} is a non-literal root prop → element-child detector bails
    // (it requires ALL root props literal). Dynamic detector also bails
    // (no ternary-of-two-literals). Net: no site.
    expect(scanCollapsibleSites(code, 'D.tsx', SRC)).toHaveLength(0)
  })

  it('distinct subtrees produce distinct keys (no collision)', () => {
    const a = scanCollapsibleSites(
      "import { Progress } from '@pyreon/ui-components'\nconst x = <Progress state=\"p\"><div style=\"width:10%\" /></Progress>",
      'A.tsx',
      SRC,
    )
    const b = scanCollapsibleSites(
      "import { Progress } from '@pyreon/ui-components'\nconst x = <Progress state=\"p\"><div style=\"width:90%\" /></Progress>",
      'B.tsx',
      SRC,
    )
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0]!.key).not.toBe(b[0]!.key)
  })

  it('text-only site still routes to the FULL path (no childTree)', () => {
    const code = [
      "import { Button } from '@pyreon/ui-components'",
      'const x = <Button state="primary">Save</Button>',
    ].join('\n')
    const sites = scanCollapsibleSites(code, 'T.tsx', SRC)
    expect(sites).toHaveLength(1)
    // Full-collapse site: plain text, NO childTree.
    expect(sites[0]!.childTree).toBeUndefined()
    expect(sites[0]!.childrenText).toBe('Save')
  })
})
