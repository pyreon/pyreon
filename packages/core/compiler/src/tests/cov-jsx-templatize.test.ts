/**
 * Branch coverage — `jsx.ts` `templatizeComponentChildren` (absorbing COMPONENT
 * children into the enclosing `_tpl` skeleton).
 *
 * The option absorbs exactly `[element*][component+]` and BAILS every other
 * arrangement byte-identically to the option being off. Each spec asserts which
 * of the two happened, so a widened (or narrowed) eligibility rule fails here.
 */
import { describe, expect, it } from 'vitest'
import { TPL_HOLE_ATTR, transformJSX, transformJSX_JS } from '../jsx'

const ON = { templatizeComponentChildren: true } as const
const t = (src: string) => transformJSX_JS(src, 'in.tsx', ON).code
const off = (src: string) => transformJSX_JS(src, 'in.tsx').code
const bothAgree = (src: string) => {
  const js = transformJSX_JS(src, 'in.tsx', ON).code
  expect(transformJSX(src, 'in.tsx', ON).code).toBe(js)
  return js
}
/** A BAIL must be byte-identical to the option being off. */
const bails = (src: string) => {
  const on = t(src)
  expect(on).toBe(off(src))
  return on
}

describe('jsx.ts — the absorbed arrangement `[element*][component+]`', () => {
  it('absorbs a trailing run of components into a mount hole', () => {
    const out = bothAgree('<div class="branch"><Node/><Node/></div>')
    expect(out).toContain(TPL_HOLE_ATTR)
    expect(out).toContain('_mountChild(<Node/>, __root, null)')
  })

  it('absorbs components PRECEDED by baked elements', () => {
    const out = t('<div><span/><Node/></div>')
    expect(out).toContain('<span></span>')
    expect(out).toContain('_mountChild(<Node/>')
  })

  it('absorbs through a FRAGMENT wrapper at any depth', () => {
    const out = t('<div><><Node/></></div>')
    expect(out).toContain('_mountChild(<Node/>')
  })

  it('a SELF-CLOSING element sibling does not defeat the absorb', () => {
    const out = t('<section><div /><Node/></section>')
    expect(out).toContain('<div></div>')
    expect(out).toContain('_mountChild(<Node/>')
  })

  it('a self-closing element BEFORE the component run is walked and contributes nothing', () => {
    // `templateAbsorbsComponent` recurses into every element child; a
    // self-closing one short-circuits without descending.
    const out = t('<section><img /><Node/></section>')
    expect(out).toContain('<img>')
    expect(out).toContain('_mountChild(<Node/>')
  })

  it('a NESTED self-closing element inside a non-absorbing sibling is walked too', () => {
    const out = t('<section><div><img /></div><Node/></section>')
    expect(out).toContain('_mountChild(<Node/>')
  })

  it('the hole attribute is emitted on the ABSORBING element only', () => {
    const out = t('<div><span/><Node/></div>')
    expect(out.match(new RegExp(TPL_HOLE_ATTR, 'g'))).toHaveLength(1)
  })
})

describe('jsx.ts — arrangements that BAIL (byte-identical to the option off)', () => {
  it('a component followed by static content bails', () => {
    expect(bails('<div><Node/><span/></div>')).not.toContain('_mountChild')
  })

  it('TEXT before the component run bails', () => {
    expect(bails('<div>hi<Node/></div>')).not.toContain('_mountChild')
  })

  it('an EXPRESSION before the component run bails', () => {
    expect(bails('<div>{x}<Node/></div>')).not.toContain('_mountChild')
  })

  it('an expression AFTER the component run bails', () => {
    expect(bails('<div><Node/>{x}</div>')).not.toContain('_mountChild')
  })

  it('WHITESPACE-only text around the run does NOT bail (it is not a position)', () => {
    const out = t('<div>\n  <span/>\n  <Node/>\n</div>')
    expect(out).toContain('_mountChild')
  })

  it('a COMMENT-only expression container does not bail either', () => {
    const out = t('<div><span/>{/* c */}<Node/></div>')
    expect(out).toContain('_mountChild')
  })

  it('an element list with NO component is unaffected', () => {
    expect(bails('<div><span/><b/></div>')).not.toContain(TPL_HOLE_ATTR)
  })
})

describe('jsx.ts — the eager-ordering gate (a bind that MOUNTS must not run before `provide()`)', () => {
  it('a component`s SOLE child is `_lc`-deferred, so it may absorb', () => {
    const out = t('<Prov><div><Node/></div></Prov>')
    expect(out).toContain('_lc(() =>')
    expect(out).toContain('_mountChild(<Node/>')
  })

  it('a MULTI-child component parent bails (the argument would run before setup)', () => {
    expect(bails('<Prov><div><Node/></div><p/></Prov>')).not.toContain('_mountChild')
  })

  it('a FRAGMENT parent bails', () => {
    expect(bails('<><div><Node/></div></>')).not.toContain('_mountChild')
  })

  it('a MEMBER-expression tag parent bails (`<Ctx.Provider>` is never `_lc`-wrapped)', () => {
    expect(bails('<Ctx.Provider><div><Node/></div></Ctx.Provider>')).not.toContain('_mountChild')
  })

  it('a NAMESPACED tag parent bails for the same reason', () => {
    expect(bails('<svg:g><div><Node/></div></svg:g>')).not.toContain('_mountChild')
  })

  it('a DOM-element parent does NOT trigger the gate', () => {
    const out = t('<section><div><Node/></div></section>')
    expect(out).toContain('_mountChild')
  })

  it('a purely STATIC template under a component parent is unaffected by the gate', () => {
    const out = t('<Prov><div><span/></div><p/></Prov>')
    expect(out).toContain('_tpl(')
  })
})

describe('jsx.ts — the option is OFF by default', () => {
  it('the same source bails without the option', () => {
    const out = off('<div class="branch"><Node/><Node/></div>')
    expect(out).not.toContain('_mountChild')
    expect(out).not.toContain(TPL_HOLE_ATTR)
  })

  it('the option is client-emit only — an SSR transform ignores it', () => {
    const out = transformJSX_JS('<div><Node/></div>', 'in.tsx', { ...ON, ssr: true }).code
    expect(out).not.toContain('_mountChild')
  })
})
