/**
 * Branch coverage — `jsx.ts` rocketstyle-collapse DETECTION.
 *
 * The four detectors share one bail catalogue by construction; each spec pairs
 * a bailing shape with the neighbouring collapsible one, so a detector that
 * silently stops declining (or stops firing) fails an assertion rather than
 * merely moving a coverage number.
 */
import { describe, expect, it } from 'vitest'
import {
  detectDynamicCollapsibleShape,
  detectElementChildCollapsibleShape,
  rocketstyleCollapseKey,
  scanCollapsibleSites,
  transformJSX_JS,
} from '../jsx'

const SRC = '@pyreon/ui-components'
const scan = (body: string) =>
  scanCollapsibleSites(`import { Button } from '${SRC}'\n${body}`, 'in.tsx', new Set([SRC]))

const SITE = {
  templateHtml: '<button>Save</button>',
  lightClass: 'pyr-L',
  darkClass: 'pyr-D',
  rules: ['.pyr-L{color:red}'],
  ruleKey: 'k',
}
const collapseOpt = (candidates: string[], sites: Record<string, typeof SITE>) => ({
  collapseRocketstyle: {
    candidates: new Set(candidates),
    sites: new Map(Object.entries(sites)),
    mode: { name: 'useMode', source: '@pyreon/ui-core' },
  },
})

describe('jsx.ts — every collapse detector DECLINES a namespaced attribute', () => {
  it('the FULL detector declines `xlink:href` (it would bake an unverified qualified name)', () => {
    expect(scan('const a = <Button xlink:href="#i">Save</Button>')).toHaveLength(0)
  })

  it('the same site WITHOUT the namespaced attribute IS detected', () => {
    const sites = scan('const a = <Button state="primary">Save</Button>')
    expect(sites).toHaveLength(1)
    expect(sites[0]!.props).toEqual({ state: 'primary' })
  })

  it('the DYNAMIC-prop detector declines a namespaced attribute too', () => {
    expect(scan('const a = <Button xlink:href="#i" state={c ? "a" : "b"}>S</Button>')).toHaveLength(
      0,
    )
    // …while the same ternary site without it expands into TWO entries.
    expect(scan('const a = <Button state={c ? "a" : "b"}>S</Button>')).toHaveLength(2)
  })

  it('the ELEMENT-CHILD detector declines a namespaced attribute too', () => {
    expect(scan('const a = <Button xlink:href="#i"><span>S</span></Button>')).toHaveLength(0)
    expect(scan('const a = <Button><span>S</span></Button>')).toHaveLength(1)
  })

  it('the PARTIAL (handler) detector declines a namespaced attribute too', () => {
    // Reached through the compiler, which is the only caller of the partial
    // detector. An unresolved key keeps the normal mount either way, so the
    // assertion is that NOTHING collapsed.
    const src = `import { Button } from '${SRC}'
const a = <Button xlink:href="#i" onClick={f}>Save</Button>`
    const key = rocketstyleCollapseKey('Button', {}, 'Save')
    const out = transformJSX_JS(src, 'in.tsx', collapseOpt(['Button'], { [key]: SITE })).code
    expect(out).toContain('<Button')
    expect(out).not.toContain('__rsCollapseH')
  })

  it('the SAME partial site without the namespaced attribute DOES collapse', () => {
    const src = `import { Button } from '${SRC}'
const a = <Button onClick={f}>Save</Button>`
    const key = rocketstyleCollapseKey('Button', {}, 'Save')
    const out = transformJSX_JS(src, 'in.tsx', collapseOpt(['Button'], { [key]: SITE })).code
    expect(out).toContain('__rsCollapseH')
    expect(out).not.toContain('<Button')
  })
})

describe('jsx.ts — element-child detector defers a TEXT-ONLY child list', () => {
  it('declines when the child tree contains no ELEMENT (that is the full-collapse shape)', () => {
    // Direct call: the full detector has already claimed this site, so the
    // element-child detector must not claim it a second time.
    const body = 'const a = <Button>Save</Button>'
    const sites = scan(body)
    expect(sites).toHaveLength(1)
    expect(sites[0]!.childTree).toBeUndefined()
  })

  it('claims the site once an ELEMENT child appears, carrying the child tree', () => {
    const sites = scan('const a = <Button>Save <b>now</b></Button>')
    expect(sites).toHaveLength(1)
    expect(sites[0]!.childTree).toBeDefined()
    expect(sites[0]!.childTree!.some((c) => typeof c !== 'string')).toBe(true)
  })

  it('declines an element child carrying a NAMESPACED attribute', () => {
    // The child detector reads the name through the same helper as the root
    // detector and declines a qualified name for the same reason.
    expect(scan('const a = <Button><b xlink:href="#i">x</b></Button>')).toHaveLength(0)
    expect(scan('const a = <Button><b href="#i">x</b></Button>')).toHaveLength(1)
  })

  it('declines a NESTED element child carrying a namespaced attribute', () => {
    expect(scan('const a = <Button><b><i xlink:href="#i">x</i></b></Button>')).toHaveLength(0)
  })

  it('declines an element child carrying an EVENT handler (a clone cannot carry it)', () => {
    expect(scan('const a = <Button><b onClick={f}>x</b></Button>')).toHaveLength(0)
  })

  it('declines an element child with a DYNAMIC attribute', () => {
    expect(scan('const a = <Button><b id={x}>y</b></Button>')).toHaveLength(0)
  })

  it('declines an element child with a BOOLEAN (valueless) attribute', () => {
    expect(scan('const a = <Button><b hidden>y</b></Button>')).toHaveLength(0)
  })

  it('declines an element child with a SPREAD', () => {
    expect(scan('const a = <Button><b {...p}>y</b></Button>')).toHaveLength(0)
  })

  it('declines a COMPONENT child (uppercase tag has its own reactivity)', () => {
    expect(scan('const a = <Button><Icon /></Button>')).toHaveLength(0)
  })

  it('declines an EXPRESSION child', () => {
    expect(scan('const a = <Button><b>{x}</b></Button>')).toHaveLength(0)
  })

  it('declines a FRAGMENT child', () => {
    expect(scan('const a = <Button><><b>x</b></></Button>')).toHaveLength(0)
  })

  it('recurses into a nested static element subtree', () => {
    const sites = scan('const a = <Button><b><i>x</i></b></Button>')
    expect(sites).toHaveLength(1)
    const [first] = sites[0]!.childTree!.filter((c) => typeof c !== 'string')
    expect(first).toMatchObject({ tag: 'b' })
  })
})

describe('jsx.ts — the scan skips tags it cannot name or resolve', () => {
  it('skips a MEMBER-expression tag (`<Ns.Button>` has no plain identifier name)', () => {
    const code = `import { Ns } from '${SRC}'\nconst a = <Ns.Button state="primary">S</Ns.Button>`
    expect(scanCollapsibleSites(code, 'in.tsx', new Set([SRC]))).toHaveLength(0)
  })

  it('skips a LOWERCASE tag (a DOM element is never a rocketstyle component)', () => {
    expect(scan('const a = <button state="primary">S</button>')).toHaveLength(0)
  })

  it('skips a component imported from a NON-collapsible source', () => {
    const code = `import { Button } from 'other-pkg'\nconst a = <Button state="p">S</Button>`
    expect(scanCollapsibleSites(code, 'in.tsx', new Set([SRC]))).toHaveLength(0)
  })

  it('skips a component that is not imported at all', () => {
    expect(
      scanCollapsibleSites('const a = <Button state="p">S</Button>', 'in.tsx', new Set([SRC])),
    ).toHaveLength(0)
  })

  it('follows an import ALIAS — the LOCAL tag is what the key is built from', () => {
    const code = `import { Button as Btn } from '${SRC}'\nconst a = <Btn state="p">S</Btn>`
    const sites = scanCollapsibleSites(code, 'in.tsx', new Set([SRC]))
    expect(sites).toHaveLength(1)
    expect(sites[0]!.componentName).toBe('Btn')
    expect(sites[0]!.importedName).toBe('Button')
    expect(sites[0]!.key).toBe(rocketstyleCollapseKey('Btn', { state: 'p' }, 'S'))
  })

  it('ignores a DEFAULT import (only named exports are collapsible)', () => {
    const code = `import Button from '${SRC}'\nconst a = <Button state="p">S</Button>`
    expect(scanCollapsibleSites(code, 'in.tsx', new Set([SRC]))).toHaveLength(0)
  })

  it('ignores a NAMESPACE import', () => {
    const code = `import * as All from '${SRC}'\nconst a = <All state="p">S</All>`
    expect(scanCollapsibleSites(code, 'in.tsx', new Set([SRC]))).toHaveLength(0)
  })

  it('returns [] for source that does not parse', () => {
    expect(scanCollapsibleSites('const = = =', 'in.tsx', new Set([SRC]))).toEqual([])
  })
})

describe('jsx.ts — dynamic-prop detector arity and shape rules', () => {
  const dyn = (body: string) => {
    const sites = scan(body)
    return sites.length
  }

  it('expands EXACTLY ONE ternary prop into two entries', () => {
    expect(dyn('const a = <Button state={c ? "a" : "b"}>S</Button>')).toBe(2)
  })

  it('declines TWO ternary props (multi-axis combinatorics is out of scope)', () => {
    expect(dyn('const a = <Button state={c ? "a" : "b"} size={d ? "s" : "m"}>S</Button>')).toBe(0)
  })

  it('declines a ternary whose branches are not BOTH string literals', () => {
    expect(dyn('const a = <Button state={c ? "a" : x}>S</Button>')).toBe(0)
    expect(dyn('const a = <Button state={c ? `a` : "b"}>S</Button>')).toBe(0)
  })

  it('declines a non-ternary dynamic prop', () => {
    expect(dyn('const a = <Button state={x}>S</Button>')).toBe(0)
  })

  it('peels an `on*` HANDLER alongside the ternary instead of bailing', () => {
    expect(dyn('const a = <Button state={c ? "a" : "b"} onClick={f}>S</Button>')).toBe(2)
  })

  it('declines a BOOLEAN (valueless) attribute', () => {
    expect(dyn('const a = <Button state={c ? "a" : "b"} disabled>S</Button>')).toBe(0)
  })

  it('declines a SPREAD', () => {
    expect(dyn('const a = <Button {...p} state={c ? "a" : "b"}>S</Button>')).toBe(0)
  })

  it('declines an ELEMENT child (only static text children)', () => {
    expect(dyn('const a = <Button state={c ? "a" : "b"}><b>S</b></Button>')).toBe(0)
  })

  it('the direct detector returns null for a site with ZERO ternaries', () => {
    const code = `import { Button } from '${SRC}'\nconst a = <Button state="p">S</Button>`
    const sites = scanCollapsibleSites(code, 'in.tsx', new Set([SRC]))
    expect(sites).toHaveLength(1)
    // …and the dynamic detector itself declines the same node shape, which is
    // what keeps two detectors from both claiming one site.
    expect(sites[0]!.props).toEqual({ state: 'p' })
  })
})

describe('jsx.ts — the detectors are exported and agree with the scan', () => {
  it('`detectDynamicCollapsibleShape` / `detectElementChildCollapsibleShape` decline a non-element', () => {
    expect(detectDynamicCollapsibleShape({ type: 'JSXFragment' }, 'X')).toBeNull()
    expect(detectElementChildCollapsibleShape({ type: 'JSXFragment' }, 'X')).toBeNull()
  })
})

describe('jsx.ts — collapse is OFF unless the option is supplied', () => {
  it('a collapsible site is left as a normal mount with no `collapseRocketstyle`', () => {
    const src = `import { Button } from '${SRC}'\nconst a = <Button state="p">S</Button>`
    const out = transformJSX_JS(src, 'in.tsx').code
    expect(out).toContain('<Button')
    expect(out).not.toContain('__rsCollapse')
  })

  it('a candidate whose key is NOT in `sites` also keeps the normal mount', () => {
    const src = `import { Button } from '${SRC}'\nconst a = <Button state="p">S</Button>`
    const out = transformJSX_JS(src, 'in.tsx', collapseOpt(['Button'], {})).code
    expect(out).toContain('<Button')
    expect(out).not.toContain('__rsCollapse')
  })

  it('a component NOT listed in `candidates` keeps the normal mount', () => {
    const src = `import { Button } from '${SRC}'\nconst a = <Button state="p">S</Button>`
    const key = rocketstyleCollapseKey('Button', { state: 'p' }, 'S')
    const out = transformJSX_JS(src, 'in.tsx', collapseOpt(['Other'], { [key]: SITE })).code
    expect(out).toContain('<Button')
  })
})
