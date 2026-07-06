/**
 * `<select value>` emission (PZ-09).
 *
 * <select> has NO `value` CONTENT attribute — the HTML parser ignores
 * `value="…"` on <select>, so baking it into the `_tpl` HTML is a dead
 * attribute (the select silently shows its first option). The compiler must
 * (a) NEVER bake select/value statically — emit a one-time `el.value = …`
 * PROPERTY set instead, and (b) order every select-value bind line (static
 * set AND `_bindDirect`) AFTER the element's children lines, so
 * `_bindDirect`'s eager initial update / the property assignment run with
 * the `_mountSlot`-mounted options present.
 *
 * Cross-backend parity for these shapes is locked in
 * native-equivalence.test.ts ("select value binding (PZ-09)" block).
 */
import { transformJSX_JS } from '../jsx'

function compile(src: string): string {
  return transformJSX_JS(src, 'test.tsx').code
}

describe('<select value> — static bake is skipped (dead content attribute)', () => {
  it('plain string attribute form: value="b" emits a property set, not a baked attr', () => {
    const code = compile(
      '<select value="b"><option value="a">A</option><option value="b">B</option></select>',
    )
    expect(code).not.toContain('<select value=')
    expect(code).toContain('__root.value = "b"')
    // Options are still baked into the template HTML.
    expect(code).toContain('<option value=\\"a\\">A</option>')
  })

  it('expression-container static forms all route to the property set', () => {
    expect(compile('<select value={"b"}><option/></select>')).toContain('__root.value = "b"')
    expect(compile('<select value={3}><option/></select>')).toContain('__root.value = 3')
    expect(compile('<select value={`b`}><option/></select>')).toContain('__root.value = `b`')
    expect(compile('<select value={-1}><option/></select>')).toContain('__root.value = -1')
    // PZ-05: TS type-layers unwrap at the attr classification seam, so the
    // cast form emits byte-identically to the bare literal (the cast is
    // runtime-erased anyway) — still the property set, never a baked attr.
    expect(compile('<select value={"b" as const}><option/></select>')).toContain(
      '__root.value = "b"',
    )
    expect(compile('<select value={"b" as const}><option/></select>')).not.toContain('as const')
    for (const c of [
      compile('<select value={"b"}><option/></select>'),
      compile('<select value={3}><option/></select>'),
      compile('<select value={`b`}><option/></select>'),
    ]) {
      expect(c).not.toContain('<select value=')
    }
  })

  it('plain string values are serialized quote/backslash-safe (escapeJsString)', () => {
    // Single-quoted JSX attr whose value CONTAINS a double quote — the
    // JSON-style serializer escapes it regardless of the JSX quote style.
    const code = compile(`<select value='a"b'><option/></select>`)
    expect(code).toContain('__root.value = "a\\"b"')
    // Entity handling follows the parser's `.value` (oxc does not decode
    // JSX entities) — identical treatment to the attribute BAKE path, just
    // routed through the property set.
    const entity = compile('<select value="a&amp;b"><option/></select>')
    expect(entity).toContain('__root.value = "a&amp;b"')
  })

  it('omit-semantic shapes (undefined/null/false) emit NOTHING — no clobbering of option selected attrs', () => {
    for (const src of [
      '<select value={undefined}><option/></select>',
      '<select value={null}><option/></select>',
      '<select value={false}><option/></select>',
    ]) {
      const code = compile(src)
      expect(code).not.toContain('.value')
      expect(code).not.toContain('<select value=')
    }
  })

  it('control: <input value="b"> still bakes (input value attr is the live default)', () => {
    const code = compile('<div><input value="b" /></div>')
    expect(code).toContain('value=\\"b\\"')
  })

  it('a nested select gets a phase-1 element ref for the deferred property set', () => {
    const code = compile('<div><span>x</span><select value="b"><option/></select></div>')
    expect(code).toContain('const __e0 = __root.firstElementChild.nextElementSibling')
    expect(code).toContain('__e0.value = "b"')
  })
})

describe('<select value> — bind lines are ordered AFTER the children lines', () => {
  it('reactive value + dynamic options: _bindDirect comes after _mountSlot', () => {
    const code = compile(
      'const sig = signal("b"); const x = <select value={() => sig()}>{items.map((i) => <option value={i}>{i}</option>)}</select>',
    )
    const slot = code.indexOf('_mountSlot(')
    const bind = code.indexOf('_bindDirect(sig')
    expect(slot).toBeGreaterThan(-1)
    expect(bind).toBeGreaterThan(slot)
  })

  it('static value + dynamic options: the property set comes after _mountSlot', () => {
    const code = compile(
      '<select value="b">{items.map((i) => <option value={i}>{i}</option>)}</select>',
    )
    const slot = code.indexOf('_mountSlot(')
    const set = code.indexOf('__root.value = "b"')
    expect(slot).toBeGreaterThan(-1)
    expect(set).toBeGreaterThan(slot)
  })

  it('reactive value + static options keeps the pre-fix single-binding emission (control)', () => {
    const code = compile(
      'const sig = signal("b"); const x = <select value={() => sig()}><option value="a">A</option></select>',
    )
    // No children bind lines → the deferred move is a byte-level no-op.
    expect(code).toContain('const __d0 = _bindDirect(sig, (v) => { __root.value = v })')
    expect(code).toContain('return __d0')
  })

  it('non-value select attrs (ref, events, class) stay in their normal pre-children position', () => {
    const code = compile(
      '<select id="s" value="b" onChange={(e) => f(e)}>{items.map((i) => <option value={i}>{i}</option>)}</select>',
    )
    // id bakes; the change listener line precedes _mountSlot; value follows it.
    expect(code).toContain('<select id=\\"s\\">')
    const ev = code.indexOf('__ev_change')
    const slot = code.indexOf('_mountSlot(')
    const set = code.indexOf('__root.value = "b"')
    expect(ev).toBeGreaterThan(-1)
    expect(ev).toBeLessThan(slot)
    expect(set).toBeGreaterThan(slot)
  })
})
