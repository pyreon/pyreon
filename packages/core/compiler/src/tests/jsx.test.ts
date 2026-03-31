import { transformJSX } from '../jsx'

// Helper: transform and return the code string
const t = (code: string) => transformJSX(code, 'input.tsx').code

// ─── Children ────────────────────────────────────────────────────────────────

describe('JSX transform — children', () => {
  test('wraps dynamic child expression', () => {
    const result = t('<div>{count()}</div>')
    expect(result).toContain('_tpl(')
    // Single-signal text binding uses _bindText for direct subscription
    expect(result).toContain('_bindText(count,')
  })

  test('does NOT wrap string literal child', () => {
    expect(t(`<div>{"static"}</div>`)).not.toContain('() =>')
  })

  test('does NOT wrap numeric literal child', () => {
    expect(t('<div>{42}</div>')).not.toContain('() =>')
  })

  test('does NOT wrap null child', () => {
    expect(t('<div>{null}</div>')).not.toContain('() =>')
  })

  test('does NOT double-wrap existing arrow function', () => {
    const result = t('<div>{() => count()}</div>')
    // Arrow should be unwrapped by template emission into _bindText(count, __t)
    // The original () => count() should NOT appear in the output
    expect(result).toContain('_bindText(count,')
    expect(result).not.toContain('() => count()')
  })

  test('does NOT wrap a function expression child', () => {
    const result = t('<div>{function() { return x }}</div>')
    // Function expression body should be unwrapped by template emission
    expect(result).toContain('_bind')
  })

  test('does NOT wrap plain identifier (no call = not reactive)', () => {
    expect(t('<div>{title}</div>')).not.toContain('() =>')
  })

  test('does NOT wrap ternary without calls', () => {
    expect(t('<div>{a ? b : c}</div>')).not.toContain('() =>')
  })

  test('wraps ternary that contains a call', () => {
    const result = t('<div>{a() ? b : c}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('.data = a() ? b : c')
  })

  test('does NOT wrap logical expression without calls', () => {
    expect(t('<div>{show && <span />}</div>')).not.toContain('() =>')
  })

  test('wraps logical expression containing a call', () => {
    expect(t('<div>{show() && <span />}</div>')).toContain('() => show() && <span />')
  })

  test('does NOT wrap object literal child', () => {
    expect(t("<div>{{ color: 'red' }}</div>")).not.toContain('() =>')
  })

  test('does NOT wrap array literal child', () => {
    expect(t('<div>{[1, 2, 3]}</div>')).not.toContain('() =>')
  })

  test('does NOT wrap boolean true literal', () => {
    expect(t('<div>{true}</div>')).not.toContain('() =>')
  })

  test('does NOT wrap boolean false literal', () => {
    expect(t('<div>{false}</div>')).not.toContain('() =>')
  })

  test('does NOT wrap undefined literal', () => {
    expect(t('<div>{undefined}</div>')).not.toContain('() =>')
  })

  test('does NOT wrap template literal without calls (no substitution)', () => {
    expect(t('<div>{`hello`}</div>')).not.toContain('() =>')
  })

  test('wraps template literal containing a call', () => {
    expect(t('<div>{`hello ${name()}`}</div>')).toContain('() =>')
  })

  test('wraps member access with call', () => {
    const result = t('<div>{obj.getValue()}</div>')
    expect(result).toContain('_tpl(')
    // Property access calls use _bind (not _bindText) to preserve this context
    expect(result).toContain('_bind')
  })

  test('does NOT wrap member access without call', () => {
    expect(t('<div>{obj.value}</div>')).not.toContain('() =>')
  })

  test('wraps binary expression containing a call', () => {
    const result = t('<div>{count() + 1}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('.data = count() + 1')
  })

  test('does NOT wrap binary expression without calls', () => {
    expect(t('<div>{a + b}</div>')).not.toContain('() =>')
  })

  test('wraps tagged template expression', () => {
    expect(t('<div>{css`color: red`}</div>')).toContain('() =>')
  })

  test('empty JSX expression {} gets _tpl optimization', () => {
    const result = t('<div>{/* comment */}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('() => null')
  })
})

// ─── Props ────────────────────────────────────────────────────────────────────

describe('JSX transform — props', () => {
  test('wraps dynamic class prop', () => {
    expect(t('<div class={activeClass()} />')).toContain('() => activeClass()')
  })

  test('wraps dynamic style prop', () => {
    expect(t('<div style={styles()} />')).toContain('() => styles()')
  })

  test('does NOT wrap string literal prop', () => {
    expect(t(`<div class="foo" />`)).not.toContain('() =>')
  })

  test('does NOT wrap JSX string attribute', () => {
    expect(t(`<div class={"foo"} />`)).not.toContain('() =>')
  })

  test('does NOT wrap onClick (event handler)', () => {
    const result = t('<button onClick={handleClick} />')
    expect(result).not.toContain('() => handleClick')
    expect(result).toContain('handleClick') // still present
  })

  test('does NOT wrap onInput (event handler)', () => {
    expect(t('<input onInput={handler} />')).not.toContain('() => handler')
  })

  test('does NOT wrap onMouseEnter (event handler)', () => {
    expect(t('<div onMouseEnter={fn} />')).not.toContain('() => fn')
  })

  test('does NOT wrap key prop', () => {
    expect(t('<div key={id} />')).not.toContain('() => id')
  })

  test('does NOT wrap ref prop', () => {
    expect(t('<div ref={myRef} />')).not.toContain('() => myRef')
  })

  test('does NOT wrap already-wrapped prop', () => {
    const result = t('<div class={() => cls()} />')
    expect(result.match(/\(\) =>/g)?.length).toBe(1)
  })

  test('does NOT wrap object literal prop (style)', () => {
    expect(t('<div style={{ color: "red" }} />')).not.toContain('() =>')
  })

  test('wraps object literal prop when it contains a call', () => {
    expect(t('<div style={{ color: theme() }} />')).toContain('() =>')
  })

  test('does NOT wrap boolean shorthand attribute', () => {
    // <input disabled /> — no initializer at all
    expect(t('<input disabled />')).not.toContain('() =>')
  })

  test('wraps dynamic data-* attribute', () => {
    expect(t('<div data-id={getId()} />')).toContain('() => getId()')
  })

  test('wraps dynamic aria-* attribute', () => {
    expect(t('<div aria-label={getLabel()} />')).toContain('() => getLabel()')
  })

  test('does NOT wrap onFocus (event handler)', () => {
    expect(t('<input onFocus={handler} />')).not.toContain('() => handler')
  })

  test('does NOT wrap onChange (event handler)', () => {
    expect(t('<input onChange={handler} />')).not.toContain('() => handler')
  })

  test('wraps conditional prop expression with call', () => {
    expect(t("<div title={isActive() ? 'yes' : 'no'} />")).toContain('() =>')
  })
})

// ─── Component elements ──────────────────────────────────────────────────────

describe('JSX transform — component elements', () => {
  test('wraps reactive props on component elements with _rp brand', () => {
    const result = t('<MyComponent value={count()} />')
    expect(result).toContain('_rp(() => count())')
  })

  test('wraps reactive props on any uppercase component with _rp brand', () => {
    const result = t('<Button label={getText()} />')
    expect(result).toContain('_rp(() => getText())')
  })

  test('emits _rp import when component has reactive props', () => {
    const result = t('<Button label={getText()} />')
    expect(result).toContain('import { _rp } from "@pyreon/core"')
  })

  test('does NOT wrap static props on component elements', () => {
    const result = t('<Button size={12} />')
    expect(result).not.toContain('() =>')
  })

  test('does NOT wrap event handlers on component elements', () => {
    const result = t('<Button onClick={handleClick} />')
    expect(result).not.toContain('() => handleClick')
  })

  test('does NOT wrap arrow function props on component elements', () => {
    const result = t('<Button render={() => "hello"} />')
    expect(result).not.toContain('() => () =>')
  })

  test('wraps children of component elements (via JSX expression)', () => {
    // Children in expression containers are still wrapped
    const result = t('<MyComponent>{count()}</MyComponent>')
    expect(result).toContain('() => count()')
  })

  test('wraps props on lowercase DOM elements', () => {
    expect(t('<div title={getTitle()} />')).toContain('() => getTitle()')
  })
})

// ─── Spread attributes ──────────────────────────────────────────────────────

describe('JSX transform — spread attributes', () => {
  test('spread props are left unchanged (not wrapped)', () => {
    const result = t('<div {...props} />')
    // Spread should remain as-is, no reactive wrapping
    expect(result).toContain('{...props}')
    expect(result).not.toContain('() => ...props')
  })

  test('spread with other props — only non-spread dynamic props get wrapped', () => {
    const result = t('<div {...props} class={cls()} />')
    expect(result).toContain('{...props}')
    expect(result).toContain('() => cls()')
  })
})

// ─── Static hoisting ─────────────────────────────────────────────────────────

describe('JSX transform — static hoisting', () => {
  test('hoists static JSX child to module scope', () => {
    const result = t('<div>{<span>Hello</span>}</div>')
    expect(result).toContain('const _$h0')
    expect(result).toContain('<span>Hello</span>')
    expect(result).toContain('{_$h0}')
  })

  test('hoists static self-closing JSX', () => {
    const result = t('<div>{<br />}</div>')
    expect(result).toContain('const _$h0')
    expect(result).toContain('{_$h0}')
  })

  test('does NOT hoist JSX with dynamic props', () => {
    const result = t('<div>{<span class={cls()}>text</span>}</div>')
    expect(result).not.toContain('const _$h0')
  })

  test('hoists JSX with static string prop', () => {
    const result = t(`<div>{<span class="foo">text</span>}</div>`)
    expect(result).toContain('const _$h0')
  })

  test('hoists multiple static JSX children independently', () => {
    const result = t('<div>{<span>A</span>}{<span>B</span>}</div>')
    expect(result).toContain('const _$h0')
    expect(result).toContain('const _$h1')
  })

  test('hoists static fragment', () => {
    const result = t('<div>{<>text</>}</div>')
    expect(result).toContain('const _$h0')
  })

  test('does NOT hoist fragment with dynamic child', () => {
    const result = t('<div>{<>{count()}</>}</div>')
    expect(result).not.toContain('const _$h0')
  })

  test('hoisted declarations include @__PURE__ annotation', () => {
    const result = t('<div>{<span>Hello</span>}</div>')
    expect(result).toContain('/*@__PURE__*/')
  })

  test('does NOT hoist JSX with spread attributes (always dynamic)', () => {
    const result = t('<div>{<span {...props}>text</span>}</div>')
    expect(result).not.toContain('const _$h0')
  })
})

// ─── Mixed ────────────────────────────────────────────────────────────────────

describe('JSX transform — mixed', () => {
  test('wraps props and children independently', () => {
    const result = t('<div class={cls()}>{text()}</div>')
    expect(result).toContain('_tpl(')
    // className uses _bindDirect (single-signal), text uses _bindText
    expect(result).toContain('_bindDirect(cls,')
    expect(result).toContain('_bindText(text,')
  })

  test('preserves static siblings of dynamic children', () => {
    const result = t('<div>static{count()}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('static')
    expect(result).toContain('_bindText(count,')
  })

  test('leaves code outside JSX completely unchanged', () => {
    const input = 'const x = count() + 1'
    expect(t(input)).toBe(input)
  })

  test('handles multiple JSX elements in one file', () => {
    const input = `
const A = <div>{a()}</div>
const B = <span>{b()}</span>
`
    const result = t(input)
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindText(a,')
    expect(result).toContain('_bindText(b,')
  })

  test('handles deeply nested JSX', () => {
    const result = t('<div><span><em>{count()}</em></span></div>')
    // Template emission: 3 DOM elements → _tpl() call with _bindText binding
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindText(count,')
  })

  test('returns unchanged code when no JSX present', () => {
    const input = 'const x = 1 + 2'
    expect(t(input)).toBe(input)
  })

  test('handles empty JSX element', () => {
    const result = t('<div></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<div></div>')
    expect(result).toContain('() => null')
  })

  test('handles self-closing element with no props', () => {
    const result = t('<br />')
    expect(result).toBe('<br />')
  })
})

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe('JSX transform — edge cases', () => {
  test('wraps chained method call', () => {
    expect(t('<div>{items().map(x => x)}</div>')).toContain('() =>')
  })

  test('does not emit _bindText for method calls (preserves this context)', () => {
    // value.toLocaleString() — property access must NOT use _bindText
    // because detaching the method loses `this` context
    const result = t('<div><p>{value.toLocaleString()}</p></div>')
    expect(result).not.toContain('_bindText(value.toLocaleString,')
    expect(result).toContain('_bind')
  })

  test('toLocaleString on signal read preserves this context', () => {
    // {() => count().toLocaleString()} should NOT detach .toLocaleString
    const result = t('<div>{() => count().toLocaleString()}</div>')
    expect(result).not.toContain('_bindText(count,')
    // The arrow wraps a chained call — it should use _bind, not _bindText
    expect(result).toContain('_bind')
  })

  test('wraps nested call in array expression', () => {
    expect(t('<div>{[getItem()]}</div>')).toContain('() =>')
  })

  test('handles JSX with only text children (no expression)', () => {
    const result = t('<div>hello world</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('hello world')
    expect(result).toContain('() => null')
  })

  test('does NOT wrap arrow function with params', () => {
    const result = t('<div>{(x: number) => x + 1}</div>')
    expect(result).not.toContain('() => (x')
  })

  test('handles .jsx file extension', () => {
    const result = transformJSX('<div>{count()}</div>', 'file.jsx').code
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindText(count,')
  })

  test('handles .ts file extension (treated as TSX)', () => {
    const result = transformJSX('<div>{count()}</div>', 'file.ts').code
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindText(count,')
  })

  test('wraps call inside array map', () => {
    expect(t('<ul>{items().map(i => <li>{i}</li>)}</ul>')).toContain('() =>')
  })

  test('does NOT wrap callback function expression inside event prop', () => {
    const result = t('<button onClick={() => doSomething()} />')
    // onClick is an event handler, should not be wrapped at all
    expect(result).not.toContain('() => () =>')
  })

  test('wraps call deep in property access chain', () => {
    expect(t('<div>{store.getState().count}</div>')).toContain('() =>')
  })

  test('does NOT wrap function expression child (named)', () => {
    const result = t('<div>{function foo() { return 1 }}</div>')
    expect(result).not.toContain('() => function')
  })
})

// ─── TransformResult type ────────────────────────────────────────────────────

describe('transformJSX return value', () => {
  test('returns object with code property', () => {
    const result = transformJSX('<div>{count()}</div>')
    expect(typeof result.code).toBe('string')
  })

  test('default filename is input.tsx', () => {
    // Should not throw with default filename
    const result = transformJSX('<div>{count()}</div>')
    expect(result.code).toContain('_tpl(')
    expect(result.code).toContain('_bindText(count,')
  })
})

// ─── Template emission ──────────────────────────────────────────────────────

describe('JSX transform — template emission', () => {
  test('emits _tpl for 2+ element tree', () => {
    const result = t('<div><span>hello</span></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<div><span>hello</span></div>')
  })

  test('emits _tpl for single element', () => {
    const result = t('<div>hello</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('hello')
  })

  test('does NOT emit _tpl for component elements', () => {
    const result = t('<div><MyComponent /></div>')
    expect(result).not.toContain('_tpl(')
  })

  test('does NOT emit _tpl for spread attributes', () => {
    const result = t('<div {...props}><span /></div>')
    expect(result).not.toContain('_tpl(')
  })

  test('does NOT emit _tpl for keyed elements', () => {
    const result = t('<div key={id}><span /></div>')
    expect(result).not.toContain('_tpl(')
  })

  test('bakes static string attributes into HTML', () => {
    const result = t('<div class="box"><span /></div>')
    // Quotes are escaped inside the _tpl("...") string literal
    expect(result).toContain('class=\\"box\\"')
    expect(result).toContain('_tpl(')
  })

  test('bakes boolean shorthand attributes into HTML', () => {
    const result = t('<div><input disabled /></div>')
    expect(result).toContain(' disabled')
    expect(result).toContain('_tpl(')
  })

  test('generates _bindDirect for reactive class with single signal', () => {
    const result = t('<div class={cls()}><span /></div>')
    expect(result).toContain('_bindDirect(cls,')
    expect(result).toContain('className')
  })

  test('generates _bindText for reactive text child with single signal', () => {
    const result = t('<div><span>{name()}</span></div>')
    expect(result).toContain('_bindText(name,')
  })

  test('generates one-time set for static expression text', () => {
    const result = t('<div><span>{label}</span></div>')
    expect(result).toContain('textContent = label')
    expect(result).not.toContain('_bind(')
  })

  test('generates delegated event for common events', () => {
    const result = t('<div><button onClick={handler}>click</button></div>')
    // click is delegated — uses expando property instead of addEventListener
    expect(result).toContain('__ev_click = handler')
  })

  test('uses element children indexing for nested access', () => {
    const result = t('<div><span>{a()}</span><em>{b()}</em></div>')
    // Can't have two expression children in same parent, but each is in its own element
    expect(result).toContain('__root.children[0]')
    expect(result).toContain('__root.children[1]')
  })

  test('handles deeply nested element paths', () => {
    const result = t('<table><tbody><tr><td>{text()}</td></tr></tbody></table>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindText(text,')
  })

  test('adds template imports when _tpl is emitted', () => {
    const result = transformJSX('<div><span>text</span></div>')
    expect(result.code).toContain('import { _tpl } from "@pyreon/runtime-dom"')
    expect(result.usesTemplates).toBe(true)
  })

  test('adds template imports for single element', () => {
    const result = transformJSX('<div>text</div>')
    expect(result.code).toContain('import { _tpl } from "@pyreon/runtime-dom"')
    expect(result.usesTemplates).toBe(true)
  })

  test('wraps _tpl call in braces when child of JSX element', () => {
    // <Comp> is a component, so outer element is not templateized
    // but <span><em> inside it has 2 elements
    const result = t('<Comp><span><em>text</em></span></Comp>')
    // The inner span+em gets templateized inside the component children
    expect(result).toContain('{_tpl(')
  })

  test('handles self-closing void elements in template', () => {
    const result = t('<div><br /><span>text</span></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<br>')
    expect(result).not.toContain('</br>')
  })

  test('handles mixed static text and element children', () => {
    const result = t('<div class="c"><span>inner</span></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<span>inner</span>')
  })

  test('escapes quotes in HTML attribute values', () => {
    const result = t('<div title="say &quot;hi&quot;"><span /></div>')
    expect(result).toContain('_tpl(')
  })

  test('returns null cleanup when no dynamic bindings', () => {
    const result = t('<div><span>static</span></div>')
    expect(result).toContain('() => null')
  })

  test('composes multiple disposers in cleanup', () => {
    const result = t('<div class={a()}><span>{b()}</span></div>')
    expect(result).toContain('__d0()')
    expect(result).toContain('__d1()')
  })

  test('maps className to class in HTML', () => {
    const result = t('<div className="box"><span /></div>')
    // Quotes escaped in _tpl string literal
    expect(result).toContain('class=\\"box\\"')
    expect(result).not.toContain('className')
  })

  test('maps htmlFor to for in HTML', () => {
    const result = t('<div><label htmlFor="name">Name</label></div>')
    expect(result).toContain('for=\\"name\\"')
  })

  test('inlines fragments inside template', () => {
    const result = t('<div><><span>text</span></></div>')
    // Fragment children are inlined as direct children
    expect(result).toContain('_tpl(')
    expect(result).toContain('<span>text</span>')
  })

  test('bails on expression children containing JSX', () => {
    const result = t('<div><span />{show() && <em />}</div>')
    expect(result).not.toContain('_tpl(')
  })

  test('handles mixed element + expression children', () => {
    const result = t('<div><span />{text()}</div>')
    // Mixed element + expression children use childNodes indexing
    expect(result).toContain('_tpl(')
    expect(result).toContain('childNodes[')
    expect(result).toContain('_bindText(text,')
  })

  test('benchmark-like row structure', () => {
    const result = t(
      '<tr class={cls()}><td class="id">{String(row.id)}</td><td>{row.label()}</td></tr>',
    )
    expect(result).toContain('_tpl(')
    expect(result).toContain('<td class=\\"id\\"></td><td></td>')
    // className uses _bindDirect (single-signal cls())
    expect(result).toContain('_bindDirect(cls,')
    // String(row.id) has args → combined _bind; row.label() is property access → _bind
    expect(result).toContain('.data = String(row.id)')
    expect(result).toContain('row.label()')
  })

  test('handles multiple expression children', () => {
    const result = t('<div><span>{a()}{b()}</span></div>')
    expect(result).toContain('_tpl(')
    // Both are single-signal → _bindText
    expect(result).toContain('_bindText(a,')
    expect(result).toContain('_bindText(b,')
    // Each expression gets its own placeholder and childNodes access
    expect(result).toContain('childNodes[0]')
    expect(result).toContain('childNodes[1]')
  })

  test('handles mixed text + element + expression children', () => {
    const result = t('<div>hello<span />{name()}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('childNodes[')
    expect(result).toContain('_bindText(name,')
  })

  test('handles fragment with element children inside template', () => {
    const result = t('<div><><span>a</span><em>b</em></></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<span>a</span>')
    expect(result).toContain('<em>b</em>')
  })

  test('bails on fragment with non-eligible children', () => {
    const result = t('<div><><Component /></></div>')
    expect(result).not.toContain('_tpl(')
  })

  test('handles static expression in mixed children', () => {
    const result = t('<div><span />{label}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('childNodes[')
    expect(result).toContain('createTextNode(label)')
  })

  test('bakes static numeric literal attr into HTML', () => {
    const result = t('<div tabindex={0}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('tabindex=\\"0\\"')
  })

  test('bakes static true keyword attr into HTML', () => {
    const result = t('<div hidden={true}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain(' hidden')
  })

  test('omits false keyword attr from HTML', () => {
    const result = t('<div hidden={false}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).not.toContain('hidden')
  })

  test('omits null keyword attr from HTML', () => {
    const result = t('<div hidden={null}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).not.toContain('hidden')
  })

  test('emits setAttribute for undefined keyword attr', () => {
    const result = t('<div hidden={undefined}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('setAttribute("hidden", undefined)')
  })

  test('one-time set for non-class static expression attribute', () => {
    const result = t('<div title={someVar}><span /></div>')
    expect(result).toContain('setAttribute("title", someVar)')
    expect(result).not.toContain('_bind(')
  })

  test('_bindDirect for non-class single-signal dynamic attribute', () => {
    const result = t('<div title={getTitle()}><span /></div>')
    expect(result).toContain('_bindDirect(getTitle,')
    expect(result).toContain('setAttribute("title"')
  })

  test('ref attribute in template binds .current', () => {
    const result = t('<div ref={myRef}><span /></div>')
    expect(result).toContain('myRef.current = __root')
  })

  test('handles non-void self-closing element as closing tag', () => {
    const result = t('<div><span></span></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<span></span>')
  })

  test('handles nested fragment with expression child', () => {
    const result = t('<div><><span />{name()}</></div>')
    // Fragment with expression is inlined, expression with JSX is not present
    expect(result).toContain('_tpl(')
  })

  test('handles fragment with expression containing no JSX', () => {
    const result = t('<div><><span />{count()}</></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindText(count,')
  })

  test('handles nested fragment with text children', () => {
    const result = t('<div><>hello</></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('hello')
  })

  test('bails on fragment with non-element non-expression child', () => {
    // Fragment containing a component should bail
    const result = t('<div><><MyComp /></></div>')
    expect(result).not.toContain('_tpl(')
  })

  test('empty expression inside template is handled', () => {
    const result = t('<div><span />{/* comment */}</div>')
    expect(result).toContain('_tpl(')
  })

  test('static expression with multi-expression context uses placeholder', () => {
    const result = t('<div><span>{label}{other}</span></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('childNodes[0]')
    expect(result).toContain('childNodes[1]')
  })
})

// ─── Compiler warnings ─────────────────────────────────────────────────────

describe('JSX transform — warnings', () => {
  test('warns on <For> without by prop', () => {
    const result = transformJSX('<For each={items}>{(item) => <li>{item}</li>}</For>')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.code).toBe('missing-key-on-for')
    expect(result.warnings[0]?.line).toBeGreaterThan(0)
    expect(result.warnings[0]?.column).toBeGreaterThanOrEqual(0)
  })

  test('no warning on <For> with by prop', () => {
    const result = transformJSX(
      '<For each={items} by={(item) => item.id}>{(item) => <li>{item}</li>}</For>',
    )
    const forWarnings = result.warnings.filter((w) => w.code === 'missing-key-on-for')
    expect(forWarnings).toHaveLength(0)
  })

  test('no warning on non-For elements without by', () => {
    const result = transformJSX('<div each={items}>{text()}</div>')
    const forWarnings = result.warnings.filter((w) => w.code === 'missing-key-on-for')
    expect(forWarnings).toHaveLength(0)
  })
})

// ─── Hoisting in prop position ──────────────────────────────────────────────

describe('JSX transform — static JSX attribute hoisting', () => {
  test('hoists static JSX in a DOM element prop', () => {
    const result = t('<div icon={<span>icon</span>} />')
    expect(result).toContain('const _$h0')
    expect(result).toContain('<span>icon</span>')
  })
})

// ─── Additional branch coverage tests ────────────────────────────────────────

describe('JSX transform — child expression branches (non-template context)', () => {
  test('wraps dynamic child expression inside a component (non-template path)', () => {
    // Component elements skip template emission, so the child expression
    // goes through the walk() JSX expression handler (lines 195-209)
    const result = t('<MyComponent>{count()}</MyComponent>')
    expect(result).toContain('() => count()')
  })

  test('does NOT wrap non-dynamic child expression inside a component', () => {
    // Component context: child expression with no calls — shouldWrap returns false
    // This hits the else branch where neither hoist nor wrap applies (lines 202-204)
    const result = t('<MyComponent>{someVar}</MyComponent>')
    expect(result).not.toContain('() =>')
    expect(result).toContain('someVar')
  })

  test('empty expression in component child is left unchanged', () => {
    // Empty expression (comment) inside component — expr is undefined, line 205-208
    const result = t('<MyComponent>{/* comment */}</MyComponent>')
    expect(result).not.toContain('() =>')
  })
})

describe('JSX transform — nested fragment in templateFragmentCount', () => {
  test('handles nested fragment inside fragment in template', () => {
    // This triggers templateFragmentCount being called recursively for nested fragments
    // (lines 318-323)
    const result = t('<div><><><span>text</span></></></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<span>text</span>')
  })

  test('bails on nested fragment with non-eligible child', () => {
    // Nested fragment containing a component — hits line 325 (return -1)
    const result = t('<div><><><MyComp /></></></div>')
    expect(result).not.toContain('_tpl(')
  })

  test('nested fragment with expression child in templateFragmentCount', () => {
    // Fragment in fragment with expression — templateFragmentCount handles expression
    const result = t('<div><><>{count()}</></></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindText(count,')
  })

  test('nested fragment with expression containing JSX bails', () => {
    // Fragment in fragment with JSX-containing expression — bails
    const result = t('<div><><>{show() && <em />}</></></div>')
    expect(result).not.toContain('_tpl(')
  })

  test('nested fragment with empty expression in templateFragmentCount', () => {
    // Fragment in fragment with empty expression (comment)
    const result = t('<div><><>{/* comment */}</></></div>')
    expect(result).toContain('_tpl(')
  })
})

describe('JSX transform — template attribute string expression', () => {
  test('bakes string expression attribute into HTML in template', () => {
    // class={"static"} — string literal in JSX expression → baked into HTML (line 427)
    const result = t('<div class={"static-value"}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('class=\\"static-value\\"')
    expect(result).not.toContain('className')
  })

  test('bakes non-class string expression attribute into HTML', () => {
    // title={"hello"} as expression — different attr name (line 427)
    const result = t('<div title={"hello"}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('title=\\"hello\\"')
  })
})

describe('JSX transform — one-time className set in template', () => {
  test('one-time className assignment for non-reactive class expression', () => {
    // class={someVar} where someVar has no calls — one-time set (line 450)
    const result = t('<div class={someVar}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('className = someVar')
    expect(result).not.toContain('_bind(')
  })
})

describe('JSX transform — isStaticAttrs edge cases', () => {
  test('static JSX with boolean expression prop is static', () => {
    // Boolean literal in expression: disabled={true} — isStatic returns true
    const result = t('<div>{<input disabled={true} />}</div>')
    expect(result).toContain('const _$h0')
  })

  test('static JSX with false expression prop is static', () => {
    const result = t('<div>{<input disabled={false} />}</div>')
    expect(result).toContain('const _$h0')
  })

  test('static JSX with null expression prop is static', () => {
    const result = t('<div>{<input disabled={null} />}</div>')
    expect(result).toContain('const _$h0')
  })

  test('static JSX with numeric expression prop is static', () => {
    const result = t('<div>{<input tabindex={0} />}</div>')
    expect(result).toContain('const _$h0')
  })

  test('static JSX with true expression prop is static', () => {
    const result = t('<div>{<input disabled={true} />}</div>')
    expect(result).toContain('const _$h0')
  })

  test('static JSX with empty expression prop is static', () => {
    // Empty expression in attribute: disabled={/* comment */} — expr is undefined
    const result = t('<div>{<input disabled={/* comment */} />}</div>')
    expect(result).toContain('const _$h0')
  })
})

describe('JSX transform — isStaticChild edge cases', () => {
  test('nested static fragment child is recognized as static', () => {
    // Fragment as child of a JSX element being checked for staticness
    const result = t('<div>{<div><>text</></div>}</div>')
    expect(result).toContain('const _$h0')
  })

  test('nested fragment with dynamic child prevents hoisting', () => {
    const result = t('<div>{<div><>{count()}</></div>}</div>')
    expect(result).not.toContain('const _$h0')
  })

  test('expression child in static check — static literal', () => {
    // Expression container with static value inside a JSX node being checked for staticness
    const result = t('<div>{<div>{"hello"}</div>}</div>')
    expect(result).toContain('const _$h0')
  })

  test('expression child in static check — dynamic call prevents hoisting', () => {
    const result = t('<div>{<div>{count()}</div>}</div>')
    expect(result).not.toContain('const _$h0')
  })

  test('expression child with empty expression is static', () => {
    const result = t('<div>{<div>{/* comment */}</div>}</div>')
    expect(result).toContain('const _$h0')
  })
})

// ─── Additional branch coverage for 95%+ ──────────────────────────────────────

describe('JSX transform — isStaticAttrs boolean shorthand (hoisting path)', () => {
  test('hoists static JSX with boolean shorthand attribute (no initializer)', () => {
    // This triggers isStaticAttrs → !prop.initializer → return true (line 719/2340)
    const result = t('<div>{<input disabled />}</div>')
    expect(result).toContain('const _$h0')
  })
})

describe('JSX transform — isStaticChild with element/self-closing children', () => {
  test('hoists static JSX with self-closing element child', () => {
    // Triggers isStaticChild → isJsxSelfClosingElement path (line 735/2356)
    const result = t('<div>{<div><br /></div>}</div>')
    expect(result).toContain('const _$h0')
  })

  test('hoists static JSX with nested element child', () => {
    // Triggers isStaticChild → isJsxElement path (line 736/2357)
    const result = t('<div>{<div><span>text</span></div>}</div>')
    expect(result).toContain('const _$h0')
  })

  test('does NOT hoist when nested element child has dynamic props', () => {
    // isStaticChild → isJsxElement → isStaticJSXNode returns false
    const result = t('<div>{<div><span class={cls()}>text</span></div>}</div>')
    expect(result).not.toContain('const _$h0')
  })

  test('does NOT hoist when self-closing child has dynamic props', () => {
    // isStaticChild → isJsxSelfClosingElement → isStaticJSXNode returns false
    const result = t('<div>{<div><input value={val()} /></div>}</div>')
    expect(result).not.toContain('const _$h0')
  })
})

describe('JSX transform — template ref/event without expression', () => {
  test('ref shorthand (no expression) in template is handled', () => {
    // Triggers the else branch of ref initializer check (line 2003)
    const result = t('<div ref><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).not.toContain('.current')
  })

  test('onClick shorthand (no expression) in template is handled', () => {
    // Triggers the else branch of event initializer check (line 2017)
    const result = t('<div onClick><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).not.toContain('addEventListener')
  })
})

describe('JSX transform — empty expression in DOM prop (non-template path)', () => {
  test('empty expression in DOM prop with spread (non-template) is handled', () => {
    // Spread prevents template emission → walk handles attrs
    // class={/* comment */} has no expression → else branch at line 1799
    const result = t('<div {...props} class={/* comment */} />')
    expect(result).not.toContain('() =>')
    expect(result).toContain('{...props}')
  })
})

describe('JSX transform — whitespace-only text stripped in flattenChildren', () => {
  test('whitespace-only text between elements is stripped in template', () => {
    // Triggers the else branch of `if (trimmed)` in flattenChildren (line 2207)
    const result = t(`<div>
  <span>a</span>
  <em>b</em>
</div>`)
    expect(result).toContain('_tpl(')
    expect(result).toContain('<span>a</span>')
    expect(result).toContain('<em>b</em>')
  })
})

describe('JSX transform — fragment inside flattenChildren', () => {
  test('fragment children are flattened during template child processing', () => {
    // This specifically exercises the isJsxFragment branch in flattenChildren (line 2223)
    // The key is that this fragment is processed via flattenChildren (not templateFragmentCount)
    // because the outer element is a template-eligible JsxElement
    const result = t('<div><><span>one</span><em>two</em></></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<span>one</span>')
    expect(result).toContain('<em>two</em>')
  })
})

describe('JSX transform — member expression tag names', () => {
  test('member expression tag name treated as empty in warnings', () => {
    // <ns.Component> has non-identifier tagName → tagName is "" (line 1762)
    const result = transformJSX('<ns.Comp value={x} />')
    expect(result.warnings).toHaveLength(0)
  })

  test('member expression tag in element position triggers non-identifier path', () => {
    // <ns.div> has a member expression tag → jsxTagName returns "" → templateElementCount returns -1
    const result = t('<ns.div><span /></ns.div>')
    // Should not produce template since tagName is not an identifier
    expect(result).not.toContain('_tpl(')
  })
})

// ─── Template emission edge cases ─────────────────────────────────────────────

describe('JSX transform — template emission edge cases', () => {
  test('non-delegated event (onMouseEnter) uses addEventListener not delegation', () => {
    const result = t('<div onMouseEnter={handler}><span /></div>')
    expect(result).toContain('_tpl(')
    // mouseenter is NOT in DELEGATED_EVENTS → must use addEventListener
    // onMouseEnter → eventName = "m" + "ouseEnter" = "mouseEnter"
    expect(result).toContain('addEventListener(')
    expect(result).toContain('mouseEnter')
    expect(result).not.toContain('__ev_')
  })

  test('template with both dynamic attribute AND dynamic child text', () => {
    const result = t('<div title={getTitle()}>{count()}</div>')
    expect(result).toContain('_tpl(')
    // Dynamic attribute binding
    expect(result).toContain('_bindDirect(getTitle,')
    // Dynamic child text binding
    expect(result).toContain('_bindText(count,')
  })

  test('template with multiple dynamic attributes on same element', () => {
    const result = t('<div class={cls()} title={getTitle()}><span /></div>')
    expect(result).toContain('_tpl(')
    // Both attributes should get _bindDirect bindings
    expect(result).toContain('_bindDirect(cls,')
    expect(result).toContain('_bindDirect(getTitle,')
  })

  test('template with static + dynamic children mixed', () => {
    const result = t('<div><span>static text</span>{count()}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('static text')
    expect(result).toContain('_bindText(count,')
    // Mixed children use childNodes indexing
    expect(result).toContain('childNodes[')
  })

  test('template with nested component inside DOM elements bails', () => {
    // Component child inside a DOM element prevents template emission
    const result = t('<div><span><MyComponent /></span></div>')
    expect(result).not.toContain('_tpl(')
  })

  test('fragment with template-eligible children inside template', () => {
    const result = t('<div><><span>a</span>{name()}</></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('<span>a</span>')
    expect(result).toContain('_bindText(name,')
  })
})

// ─── Style attribute handling in templates ───────────────────────────────────

describe('JSX transform — style attribute in templates', () => {
  test('style object literal uses Object.assign in _bind', () => {
    const result = t('<div style={{ overflow: "hidden" }}>text</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('Object.assign(__root.style,')
    expect(result).toContain('overflow: "hidden"')
  })

  test('style string literal inlines as HTML attribute', () => {
    const result = t('<div style="color: red">text</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('style=\\"color: red\\"')
    // Static string should NOT go through _bind
    expect(result).not.toContain('Object.assign')
    expect(result).not.toContain('cssText')
  })

  test('reactive style uses cssText in _bind', () => {
    const result = t('<div style={() => getStyle()}>text</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('style.cssText')
  })
})
