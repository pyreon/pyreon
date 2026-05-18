import { describe, expect, it } from 'vitest'
import { rocketstyleCollapseKey, transformJSX } from '../jsx'

// Layer 4: the compiler DETECTS a literal-prop rocketstyle call site
// (bail catalogue — RFC decision 3) and EMITS the collapsed
// `_rsCollapse(...)` + once-per-module idempotent `injectRules`, when
// the Vite plugin supplies an SSR-resolved `sites` entry. It never runs
// the rocketstyle chain itself. These tests stub the resolved `sites`
// map directly (no Vite) — the real SSR resolution is proven in
// @pyreon/vite-plugin's resolver test; the end-to-end byte-parity is
// proven by the ui-showcase e2e gate (Phase 4).

const SITE = {
  templateHtml: '<button data-x="1"><span class="inner">Save</span></button>',
  lightClass: 'pyr-L1 pyr-L2',
  darkClass: 'pyr-D1 pyr-D2',
  rules: ['.pyr-L1{color:red}', '.pyr-D1{color:blue}'],
  ruleKey: 'bundleA',
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

describe('rocketstyleCollapseKey — stable + order-independent', () => {
  it('same component+props+text ⇒ same key regardless of attr order', () => {
    const a = rocketstyleCollapseKey('Button', { state: 'primary', size: 'md' }, 'Save')
    const b = rocketstyleCollapseKey('Button', { size: 'md', state: 'primary' }, 'Save')
    expect(a).toBe(b)
    expect(a).not.toBe(rocketstyleCollapseKey('Button', { state: 'secondary' }, 'Save'))
    expect(a).not.toBe(rocketstyleCollapseKey('Button', { state: 'primary', size: 'md' }, 'Go'))
  })
})

describe('compiler — collapsible call site emission', () => {
  it('emits _rsCollapse + dual-emit mode thunk + once-per-module injectRules', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary', size: 'medium' }, 'Save')
    const src = `
import { Button } from '@pyreon/ui-components'
export function App() {
  return <Button state="primary" size="medium">Save</Button>
}`
    const { code } = transformJSX(src, 'App.tsx', collapseOpt(['Button'], { [key]: SITE }))
    // collapsed call replaces the JSX
    expect(code).toContain(
      '__rsCollapse("<button data-x=\\"1\\"><span class=\\"inner\\">Save</span></button>", "pyr-L1 pyr-L2", "pyr-D1 pyr-D2", () => __pyrMode() === "dark")',
    )
    // dual-emit mode accessor imported from the configured source
    expect(code).toContain('import { useMode as __pyrMode } from "@pyreon/ui-core";')
    // runtime helper + styler sheet imports
    expect(code).toContain('import { _rsCollapse as __rsCollapse } from "@pyreon/runtime-dom";')
    expect(code).toContain('import { sheet as __rsSheet } from "@pyreon/styler";')
    // once-per-module idempotent rule injection, keyed by ruleKey
    expect(code).toContain('__rsSheet.injectRules(')
    expect(code).toContain(JSON.stringify(SITE.rules))
    expect(code).toContain('"bundleA")')
    // the original <Button …> JSX is gone
    expect(code).not.toContain('<Button')
  })

  it('two identical sites in one module emit ONE injectRules (deduped by ruleKey)', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'X')
    const src = `
import { Button } from '@pyreon/ui-components'
export const A = () => <Button state="primary">X</Button>
export const B = () => <Button state="primary">X</Button>`
    const { code } = transformJSX(src, 'M.tsx', collapseOpt(['Button'], { [key]: SITE }))
    const injCount = code.split('__rsSheet.injectRules(').length - 1
    expect(injCount).toBe(1)
    const callCount = code.split('__rsCollapse(').length - 1
    // 2 call sites (the `_rsCollapse as __rsCollapse` import alias has
    // no trailing `(`, so it doesn't count)
    expect(callCount).toBe(2)
  })
})

describe('compiler — bail catalogue (RFC decision 3): NO collapse', () => {
  const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Save')
  const sites = { [key]: SITE }

  function noCollapse(src: string, opt = collapseOpt(['Button'], sites)) {
    const { code } = transformJSX(src, 'B.tsx', opt)
    expect(code).not.toContain('__rsCollapse')
    return code
  }

  it('bails on a non-literal (signal/expr) dimension prop', () => {
    noCollapse(`
import { Button } from '@pyreon/ui-components'
export const A = (p) => <Button state={p.s}>Save</Button>`)
  })

  it('bails on a JSX spread attribute', () => {
    noCollapse(`
import { Button } from '@pyreon/ui-components'
export const A = (p) => <Button state="primary" {...p}>Save</Button>`)
  })

  it('bails on an element child (non-static-text children)', () => {
    noCollapse(`
import { Button } from '@pyreon/ui-components'
export const A = () => <Button state="primary"><i>Save</i></Button>`)
  })

  it('bails on an expression child', () => {
    noCollapse(`
import { Button } from '@pyreon/ui-components'
export const A = (p) => <Button state="primary">{p.label}</Button>`)
  })

  it('bails when the component is not a registered candidate', () => {
    noCollapse(
      `
import { Card } from '@pyreon/ui-components'
export const A = () => <Card state="primary">Save</Card>`,
      collapseOpt(['Button'], sites),
    )
  })

  it('bails when there is no resolved site for the key (resolver bailed / not data)', () => {
    noCollapse(
      `
import { Button } from '@pyreon/ui-components'
export const A = () => <Button state="zzz">Save</Button>`,
      collapseOpt(['Button'], sites),
    )
  })

  it('does nothing when collapseRocketstyle option is absent (default OFF)', () => {
    const { code } = transformJSX(
      `
import { Button } from '@pyreon/ui-components'
export const A = () => <Button state="primary">Save</Button>`,
      'Off.tsx',
      {},
    )
    expect(code).not.toContain('__rsCollapse')
  })
})

describe('bisect: collapse forces the JS path', () => {
  it('emits the collapse even though a native binary may be present', () => {
    // transformJSX must short-circuit to transformJSX_JS when
    // collapseRocketstyle is set (the Rust binary doesn't implement it).
    // If the force-JS guard were removed and a native binary were
    // loaded, this would emit no __rsCollapse — proving the guard is
    // load-bearing. With the guard, JS path always runs.
    const key = rocketstyleCollapseKey('Button', {}, 'Hi')
    const { code } = transformJSX(
      `
import { Button } from '@pyreon/ui-components'
export const A = () => <Button>Hi</Button>`,
      'J.tsx',
      collapseOpt(['Button'], { [key]: SITE }),
    )
    expect(code).toContain('__rsCollapse(')
  })
})

describe('scanCollapsibleSites — plugin scanner == compiler detection', () => {
  it('finds the collapsible site with the SAME key the compiler looks up', async () => {
    const { scanCollapsibleSites } = await import('../jsx')
    const src = `
import { Button as Btn } from '@pyreon/ui-components'
import { useState } from 'somewhere'
export const A = () => <Btn state="primary" size="medium">Save</Btn>
export const B = (p) => <Btn state={p.s}>x</Btn>
export const C = () => <div state="primary">not a candidate</div>`
    const sites = scanCollapsibleSites(src, 'A.tsx', new Set(['@pyreon/ui-components']))
    // only the literal-prop, static-text <Btn> collapses; the {expr}
    // one and the <div> are bailed (catalogue) / non-candidate.
    expect(sites).toHaveLength(1)
    const s = sites[0]!
    expect(s.componentName).toBe('Btn') // LOCAL alias — key uses this
    expect(s.importedName).toBe('Button') // resolver imports this
    expect(s.source).toBe('@pyreon/ui-components')
    expect(s.props).toEqual({ state: 'primary', size: 'medium' })
    expect(s.childrenText).toBe('Save')
    // The key the plugin computes here MUST equal the key the compiler
    // recomputes from the JSX node — proven by feeding a sites map
    // keyed by s.key and asserting the compiler collapses.
    const { code } = transformJSX(src, 'A.tsx', {
      collapseRocketstyle: {
        candidates: new Set(['Btn']),
        sites: new Map([[s.key, SITE]]),
        mode: { name: 'useMode', source: '@pyreon/ui-core' },
      },
    })
    // exactly the literal-prop site collapsed; the {expr} <Btn> bailed
    // and remains as JSX (1 collapse call, 1 surviving <Btn).
    expect(code.split('__rsCollapse(').length - 1).toBe(1)
    expect(code).toContain('<Btn state={')
  })

  it('skips a component imported from a non-collapsible source', async () => {
    const { scanCollapsibleSites } = await import('../jsx')
    const src = `
import { Button } from './local-button'
export const A = () => <Button state="primary">Save</Button>`
    expect(scanCollapsibleSites(src, 'A.tsx', new Set(['@pyreon/ui-components']))).toHaveLength(0)
  })
})
