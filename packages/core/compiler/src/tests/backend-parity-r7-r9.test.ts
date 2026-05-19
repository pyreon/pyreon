/**
 * JS↔Rust backend parity — fixes the two compiler bugs scoped out of the
 * 10-round hardening sweep (#686), in BOTH backends, 1:1.
 *
 * R7 — prop-derived inlining inside callback-nested JSX. Pre-fix the native
 * backend's `collect_prop_derived_idents` had
 * `Arrow|FunctionExpression => {}` (+ no JSX arm), so
 * `const cls=props.t; items.map(i => <li class={cls}/>)` kept `class={cls}`
 * (frozen const → reactivity SILENTLY LOST under the production-preferred
 * native backend) while JS inlined `class={(props.t)}`. Fixed: the Rust arms
 * recurse into fn bodies + JSX with a `pd_minus` scope filter that is
 * byte-equivalent to the JS pass's enter/leave `shadowed` set — so recursing
 * does NOT reintroduce the param-clobber the JS scope-aware pass guards. The
 * JS scope-aware pass is included here too (origin/main lacked it), so a
 * shadowing arrow param is not clobbered on EITHER backend.
 *
 * R9 — an element-valued `const`/`let` (`const h=<h1/>`) used as a bare JSX
 * child was text-coerced (`createTextNode(h)` → "[object Object]") instead of
 * mounted, on both backends. Fixed: both backends track element-valued
 * bindings and route a bare `{h}` child through `_mountSlot` (the path
 * `props.children` already used).
 *
 * Bisect (PR body): (a) revert the Rust `ArrowFunctionExpression`/
 * `FunctionExpression` arms in native/src/lib.rs to `=> {}` + rebuild
 * (`bun run build:native`) → the R7 cross-backend specs fail (Rust reverts to
 * `class={cls}`). (b) Revert the `!shadowed.has(node.name)` guard in
 * `resolveIdentifiersInText` → SHADOW_PARAM JS emits `(props.x) =>`
 * (un-parseable) and diverges. (c) Revert the `isElementValuedIdent` clause
 * in `processOneChild` (+ the Rust `is_element_valued_ident`) → R9 specs
 * fail. Restore + rebuild → all pass.
 */
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX, transformJSX_JS } from '../jsx'

const js = (c: string): string => transformJSX_JS(c, 'c.tsx').code ?? ''
const rust = (c: string): string => transformJSX(c, 'c.tsx').code ?? ''
const parses = (s: string): boolean => {
  try {
    return (parseSync('o.tsx', s).errors?.length ?? 0) === 0
  } catch {
    return false
  }
}

const R7_CALLBACK = `function C(props){ const cls = props.theme + '-btn'; return <ul>{props.items.map(i => <li class={cls}>{i}</li>)}</ul> }`
const R7_TRANSITIVE = `function C(props){ const a = props.x; const b = a + 1; return <ul>{props.items.map(i => <li>{b}</li>)}</ul> }`
const R7_SHADOW = `function C(props){ const a = props.x; return <ul>{props.items.map(a => <li>{a}</li>)}</ul> }`
const R7_DIRECT = `function C(props){ const a = props.x; return <div>{a}</div> }`
const R9_CONST = `function C(){ const header = <h1>T</h1>; return <div>{header}<p>x</p></div> }`
const R9_LET = `function C(){ let el = <a/>; return <div>{el}</div> }`
const R9_STR_CTRL = `function C(){ const t = 'T'; return <div>{t}<p/></div> }`

describe('Round 7 — callback-nested prop-derived inlining is 1:1 JS≡Rust', () => {
  it('callback-nested prop-derived inlines on BOTH backends, identically', () => {
    expect(rust(R7_CALLBACK)).toBe(js(R7_CALLBACK))
    expect(js(R7_CALLBACK)).toContain("class={(props.theme + '-btn')}")
    expect(rust(R7_CALLBACK)).toContain("class={(props.theme + '-btn')}")
  })
  it('transitive prop-derived chain inlines in a callback on both backends', () => {
    expect(rust(R7_TRANSITIVE)).toBe(js(R7_TRANSITIVE))
    expect(rust(R7_TRANSITIVE)).toContain('{((props.x) + 1)}')
  })
  it('a shadowing arrow param is NOT clobbered on either backend (parseable + identical)', () => {
    expect(parses(js(R7_SHADOW))).toBe(true)
    expect(parses(rust(R7_SHADOW))).toBe(true)
    expect(js(R7_SHADOW)).not.toContain('(props.x) =>')
    expect(rust(R7_SHADOW)).toBe(js(R7_SHADOW))
  })
  it('direct (non-callback) prop-derived unchanged + identical', () => {
    expect(rust(R7_DIRECT)).toBe(js(R7_DIRECT))
  })
})

describe('Round 9 — element-valued binding child mounts (1:1 JS≡Rust)', () => {
  it('const element child mounts via _mountSlot on both backends, identically', () => {
    expect(rust(R9_CONST)).toBe(js(R9_CONST))
    expect(js(R9_CONST)).not.toContain('createTextNode(header)')
    expect(js(R9_CONST)).toMatch(/_mountSlot\(\s*header\b/)
    expect(rust(R9_CONST)).toMatch(/_mountSlot\(\s*header\b/)
  })
  it('let element child mounts on both backends', () => {
    expect(rust(R9_LET)).toBe(js(R9_LET))
    expect(js(R9_LET)).toMatch(/_mountSlot\(\s*el\b/)
  })
  it('CONTROL: string-valued const still text-coerced (fast path intact) + identical', () => {
    expect(rust(R9_STR_CTRL)).toBe(js(R9_STR_CTRL))
    expect(js(R9_STR_CTRL)).toContain('createTextNode(t)')
    expect(js(R9_STR_CTRL)).not.toContain('_mountSlot')
  })
})
