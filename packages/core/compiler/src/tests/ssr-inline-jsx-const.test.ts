/**
 * SSR: a prop-derived const whose initializer contains JSX must NOT be inlined.
 *
 * Prop-derived consts are inlined at their use sites by slicing the ORIGINAL
 * source for the initializer. That is wrong the moment the initializer
 * contains JSX, because the sliced text is PRE-transform (on every path since
 * #4300; this file covers the SSR shape that found it). The JSX
 * gets re-emitted verbatim into an `_ssr` hole, never lowered, and the raw
 * text drifts against offsets the emit has already shifted.
 *
 * The shape that found it: two sibling `.map()` callbacks. Their holes swapped
 * expressions, so an axis label came out carrying the edge map's path literal
 * and referenced `p1` — a binding that exists only in the OTHER callback's
 * scope. The page died with `ReferenceError: p1 is not defined`, and because
 * SSG reports pages ATTEMPTED rather than rendered, the build still said
 * "5 prerendered pages" and exited 0 over a 356-byte empty shell.
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const ssr = (code: string): string =>
  transformJSX_JS(code, 'View.tsx', { ssr: true, ssrTemplate: true }).code ?? ''

const dom = (code: string): string => transformJSX_JS(code, 'View.tsx').code ?? ''

const TWO_MAPS = `
export function View(props) {
  const edges = props.edges.map((e) => {
    const p1 = e.from, p2 = e.to
    return <path d={\`M \${p1.x} \${p1.y} C \${p2.x} \${p2.y}\`} />
  })
  const axis = props.depths.map((d, di) => (
    <text x={String(di)}>{d === 0 ? 'ENTRY' : \`DEPTH \${d}\`}</text>
  ))
  return <svg><g>{axis}</g><g>{edges}</g></svg>
}`

describe('SSR — a JSX-bearing prop-derived const is referenced, not inlined', () => {
  const out = ssr(TWO_MAPS)

  it('emits no raw JSX — every element is lowered', () => {
    // The load-bearing assertion. Inlined pre-transform source leaves literal
    // JSX in the output, which is both untransformed and syntactically wrong
    // for a file the transform has already finished with.
    //
    // Matched on JSX ATTRIBUTE syntax (`<tag attr={`), not on the tag name:
    // the lowered form legitimately contains `"<text x=\""` as a template
    // STRING, and a bare /<text/ would match that and pass for the wrong
    // reason in both directions.
    expect(out).not.toMatch(/<text[^>]*=\{/)
    expect(out).not.toMatch(/<path[^>]*=\{/)
  })

  it('references the consts by name in the holes', () => {
    // The invariant is REFERENCE-not-inline. Each const is its `<g>`'s sole
    // child, so the hole helper is `_escSole` (markers elided — see
    // `soleAccessorChild` in @pyreon/runtime-server); the name is what matters.
    // The `"s"` is the baked `<svg>` ancestor's namespace path.
    expect(out).toContain('_escSole(axis, "s")')
    expect(out).toContain('_escSole(edges, "s")')
  })

  it('does not leak one callback\'s bindings into the other\'s hole', () => {
    // `p1` belongs to the edges callback. If it appears anywhere in the OUTER
    // template call, an expression has crossed scopes and the render throws.
    // Anchored on the OUTER template specifically — `return _ssr(` also
    // matches the edges callback's own return, which contains `p1` correctly.
    const outer = out.slice(out.indexOf('_ssr(["<svg'))
    expect(outer).not.toContain('p1')
  })

  it('still lowers each callback\'s own JSX to its own template', () => {
    // The bail must not be a wholesale opt-out of the fast path: both map
    // bodies still compile to `_ssr`, each holding only its own bindings.
    expect(out).toContain('_ssr(["<path d=\\"", "\\"></path>"]')
    expect(out).toMatch(/_ssr\(\["<text x=/)
  })
})

describe('the DOM path references the const too (#4300)', () => {
  it('an element-const is mounted by name, its own class binding stays live', () => {
    // Inlining was never what kept the class reactive: the inlined copy was
    // raw JSX (a plain h() reading it once). The const's own JSX compiles to
    // a live accessor, so every path now references the const.
    const out = dom(`function C(p){ const cls=p.x+'-b'; const el=<i class={cls}/>; return <div>{el}<span class={cls}/></div> }`)
    expect(out).toMatch(/_mountSlot\(\s*el\b/)
    expect(out).toContain("const el=<i class={() => (p.x+'-b')}/>")
  })
})
