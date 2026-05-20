/**
 * PR 3 of the dynamic-prop partial-collapse build — `scanCollapsibleSites`
 * extension. The plugin-side scan (`@pyreon/vite-plugin`) calls this to
 * learn WHICH (component, props, text) tuples need resolution. For
 * dynamic-prop sites it must expand into TWO `CollapsibleSite` entries
 * (one per literal value) so the resolver pre-renders both via the
 * existing SSR pipeline AND the compiler emit (PR 3 `tryDynamicCollapse`)
 * looks up both via identical key construction.
 *
 * Key invariant: the keys this scan emits must EQUAL the keys
 * `tryDynamicCollapse` computes from the same JSX — same load-bearing
 * separation as the existing full / on*-handler scan↔emit invariants
 * (`scanCollapsibleSites` ↔ `detectCollapsibleShape`).
 */
import { describe, expect, it } from 'vitest'
import { rocketstyleCollapseKey, scanCollapsibleSites } from '../jsx'

const COLLAPSIBLE = new Set(['@pyreon/ui-components'])

describe('scanCollapsibleSites — dynamic-prop expansion (PR 3)', () => {
  it('expands a single ternary site into TWO CollapsibleSite entries (one per literal)', () => {
    const src = `
      import { Button } from '@pyreon/ui-components'
      const x = <Button state={cond ? "primary" : "secondary"} size="medium">Save</Button>
    `
    const sites = scanCollapsibleSites(src, 'A.tsx', COLLAPSIBLE)
    expect(sites).toHaveLength(2)
    const byState = new Map(sites.map((s) => [s.props.state, s]))
    expect(byState.get('primary')!.props).toEqual({ state: 'primary', size: 'medium' })
    expect(byState.get('secondary')!.props).toEqual({ state: 'secondary', size: 'medium' })
    expect(byState.get('primary')!.childrenText).toBe('Save')
    expect(byState.get('secondary')!.childrenText).toBe('Save')
    // Both entries share the same component / source / importedName —
    // only `props.state` differs.
    expect(byState.get('primary')!.componentName).toBe('Button')
    expect(byState.get('secondary')!.componentName).toBe('Button')
  })

  it('emits keys IDENTICAL to what tryDynamicCollapse will look up', () => {
    // The cross-detector invariant: the scan and the emit MUST agree
    // on the key for each expanded value. Drift would cause the emit
    // to miss its own pre-resolved sites and bail to normal mount.
    const src = `
      import { Button } from '@pyreon/ui-components'
      const x = <Button state={c ? "primary" : "secondary"}>Go</Button>
    `
    const sites = scanCollapsibleSites(src, 'B.tsx', COLLAPSIBLE)
    expect(sites).toHaveLength(2)
    const truthyKey = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Go')
    const falsyKey = rocketstyleCollapseKey('Button', { state: 'secondary' }, 'Go')
    const keys = sites.map((s) => s.key).sort()
    expect(keys).toEqual([truthyKey, falsyKey].sort())
  })

  it('SKIPS expansion when the dynamic site ALSO has on*-handlers (PR 3 scope: no-handler only)', () => {
    // The emit will bail on handler-bearing dynamic sites; the scan
    // skips them too so the resolver doesn't pre-render variants that
    // can never be claimed. Same conservative shape as the rest of
    // the family — never resolve what won't emit.
    const src = `
      import { Button } from '@pyreon/ui-components'
      const x = <Button state={c ? "primary" : "secondary"} onClick={go}>H</Button>
    `
    const sites = scanCollapsibleSites(src, 'C.tsx', COLLAPSIBLE)
    expect(sites).toHaveLength(0)
  })

  it('does not double-emit when the FULL detector already claims the site (literal-only)', () => {
    // A fully-literal site is the FULL-collapse shape — claimed by
    // detectCollapsibleShape; the dynamic-fallthrough branch in the
    // scan only runs when the full detector returned null.
    const src = `
      import { Button } from '@pyreon/ui-components'
      const x = <Button state="primary" size="medium">Save</Button>
    `
    const sites = scanCollapsibleSites(src, 'D.tsx', COLLAPSIBLE)
    expect(sites).toHaveLength(1)
    expect(sites[0]!.props).toEqual({ state: 'primary', size: 'medium' })
  })

  it('emits 4 entries for a module with 2 ternary sites (no dedupe across distinct sites)', () => {
    const src = `
      import { Button } from '@pyreon/ui-components'
      const a = <Button state={c1 ? "primary" : "secondary"}>A</Button>
      const b = <Button state={c2 ? "danger" : "success"}>B</Button>
    `
    const sites = scanCollapsibleSites(src, 'E.tsx', COLLAPSIBLE)
    expect(sites).toHaveLength(4)
    const states = sites.map((s) => `${s.props.state}/${s.childrenText}`).sort()
    expect(states).toEqual(['danger/B', 'primary/A', 'secondary/A', 'success/B'])
  })

  it('skips multi-ternary site entirely (separable scope, not this PR)', () => {
    const src = `
      import { Button } from '@pyreon/ui-components'
      const x = <Button state={a ? "x" : "y"} size={b ? "small" : "large"}>S</Button>
    `
    const sites = scanCollapsibleSites(src, 'F.tsx', COLLAPSIBLE)
    expect(sites).toHaveLength(0)
  })
})
