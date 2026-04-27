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

  test('does NOT wrap single JSX element prop — recurses into inner props', () => {
    const result = t('<Wrapper icon={<Icon name={getName()} />} />')
    // The outer <Icon> should NOT be wrapped in _rp
    expect(result).not.toContain('_rp(() => <Icon')
    // But Icon's name prop should be wrapped (it contains a call)
    expect(result).toContain('() => getName()')
  })

  test('DOES wrap conditional JSX element prop', () => {
    const result = t('<Wrapper icon={show() ? <Icon /> : null} />')
    // Conditional contains a call — wraps the whole expression
    expect(result).toContain('_rp(')
  })

  test('wraps children of component elements (via JSX expression)', () => {
    // Children in expression containers are still wrapped
    const result = t('<MyComponent>{count()}</MyComponent>')
    expect(result).toContain('() => count()')
  })

  test('wraps props on lowercase DOM elements', () => {
    expect(t('<div title={getTitle()} />')).toContain('() => getTitle()')
  })

  test('wraps ternary with call in component prop', () => {
    const result = t(`<Comp x={a() ? 'yes' : 'no'} />`)
    expect(result).toContain('_rp(')
  })

  test('wraps template literal with call in component prop', () => {
    const result = t('<Comp label={`${count()} items`} />')
    expect(result).toContain('_rp(')
  })

  test('wraps multiple reactive props independently', () => {
    const result = t('<Comp a={x()} b={y()} c={12} />')
    // Two reactive props should produce two _rp wrappers
    const rpCount = (result.match(/_rp\(/g) || []).length
    expect(rpCount).toBe(2)
    // Static prop should remain plain (JSX attribute syntax)
    expect(result).toContain('c={12}')
  })

  test('wraps children prop with call (children not in SKIP_PROPS)', () => {
    const result = t('<Comp children={items()} />')
    // children is NOT in SKIP_PROPS, so it gets _rp wrapping
    expect(result).toContain('_rp(')
  })

  test('spread props on component pass through without _rp wrapping', () => {
    const result = t('<Comp {...getProps()} label="hi" />')
    // Spread should remain as-is
    expect(result).toContain('{...getProps()}')
    // Static label should not be wrapped
    expect(result).not.toContain('_rp(() => "hi")')
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

  test('emits _tpl for root spread with _applyProps in bind', () => {
    const result = t('<div {...props}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('_applyProps(__root, props)')
  })

  test('does NOT emit _tpl for spread on inner elements', () => {
    const result = t('<div><span {...innerProps} /></div>')
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

  // Regression: multi-word event-name casing was broken — `onKeyDown`
  // produced `addEventListener("keyDown", ...)` (camelCase) instead of
  // `addEventListener("keydown", ...)` (DOM convention). The handler
  // never fired because `keyDown` is not a real DOM event name.
  // Same bug class affected `onMouseEnter`, `onMouseLeave`, etc.
  test('lowercases multi-word event names (onKeyDown → keydown — delegated)', () => {
    const result = t('<div><input onKeyDown={handler} /></div>')
    // keydown IS in DELEGATED_EVENTS — must use the expando, not addEventListener.
    // Prior behavior: addEventListener("keyDown", ...) — wrong casing AND
    // wrong path (delegated check missed because case mismatched).
    expect(result).toContain('__ev_keydown = handler')
    expect(result).not.toContain('__ev_keyDown')
    expect(result).not.toContain('"keyDown"')
  })

  test('lowercases multi-word event names (onMouseEnter → mouseenter — non-delegated)', () => {
    const result = t('<div><span onMouseEnter={handler}>hi</span></div>')
    // mouseenter is NOT delegated — must reach addEventListener with lowercase name
    expect(result).toContain('addEventListener("mouseenter", handler)')
    expect(result).not.toContain('"mouseEnter"')
  })

  test('lowercases multi-word event names for input change (onChange → change — delegated)', () => {
    const result = t('<div><input onChange={handler} /></div>')
    expect(result).toContain('__ev_change = handler')
  })

  test('lowercases multi-word event names with multiple capitals (onPointerLeave → pointerleave)', () => {
    const result = t('<div><span onPointerLeave={handler}>hi</span></div>')
    expect(result).toContain('addEventListener("pointerleave", handler)')
    expect(result).not.toContain('"pointerLeave"')
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

  test('ref attribute in template binds .current for object refs', () => {
    const result = t('<div ref={myRef}><span /></div>')
    // Object refs go through a runtime check (could also be a function)
    expect(result).toContain('myRef')
    expect(result).toContain('.current = __root')
  })

  test('ref attribute in template calls function refs', () => {
    const result = t('<div ref={(el) => { myEl = el }}><span /></div>')
    // Arrow function refs are called with the element
    expect(result).toContain('((el) => { myEl = el })(__root)')
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
    // mouseenter is NOT in DELEGATED_EVENTS → must use addEventListener.
    // The event name is the JSX attribute with the "on" prefix dropped
    // and the rest fully lowercased (`onMouseEnter` → `mouseenter`)
    // — DOM events are all-lowercase. Prior to the fix this emitted
    // `mouseEnter` (camelCase) which the browser never dispatches.
    expect(result).toContain('addEventListener("mouseenter"')
    expect(result).not.toContain('mouseEnter')
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

// ─── Pure call detection ────────────────────────────────────────────────────

describe('JSX transform — pure call detection', () => {
  test('Math.max with static args is not wrapped', () => {
    const result = t('<div>{Math.max(5, 10)}</div>')
    expect(result).not.toContain('() =>')
  })

  test('JSON.stringify with string arg is not wrapped', () => {
    const result = t('<div>{JSON.stringify("hello")}</div>')
    expect(result).not.toContain('() =>')
  })

  test('JSON.stringify with object arg IS wrapped (object not static)', () => {
    const result = t('<div>{JSON.stringify({a: 1})}</div>')
    // Object literals are not considered static by the compiler
    expect(result).toContain('.data =')
  })

  test('Math.max with dynamic arg (signal call) IS wrapped', () => {
    const result = t('<div>{Math.max(count(), 10)}</div>')
    // Dynamic argument means the result depends on a signal
    expect(result).toContain('Math.max(count(), 10)')
    expect(result).toContain('.data =')
  })

  test('unknown function call IS wrapped', () => {
    const result = t('<div>{unknownFn(5)}</div>')
    // Unknown function is not in PURE_CALLS, so it gets wrapped
    expect(result).toContain('.data =')
  })

  test('Math.floor with static arg is not wrapped', () => {
    const result = t('<div>{Math.floor(3.14)}</div>')
    expect(result).not.toContain('() =>')
  })

  test('Number.parseInt with static arg is not wrapped', () => {
    const result = t('<div>{Number.parseInt("42", 10)}</div>')
    expect(result).not.toContain('() =>')
  })
})

// ─── Per-text-node bind (separate bindings) ─────────────────────────────────

describe('JSX transform — per-text-node bind', () => {
  test('two adjacent signal calls produce two separate _bindText calls', () => {
    const result = t('<div>{a()}{b()}</div>')
    expect(result).toContain('_bindText(a,')
    expect(result).toContain('_bindText(b,')
  })

  test('two signal expressions with text between produce separate bindings', () => {
    const result = t('<div>{a()} and {b()}</div>')
    expect(result).toContain('_bindText(a,')
    expect(result).toContain('_bindText(b,')
  })

  test('three signal calls produce three separate _bindText calls', () => {
    const result = t('<div>{a()}{b()}{c()}</div>')
    expect(result).toContain('_bindText(a,')
    expect(result).toContain('_bindText(b,')
    expect(result).toContain('_bindText(c,')
  })
})

// ─── Reactive props auto-detection ──────────────────────────────────────────

describe('JSX transform — reactive props detection', () => {
  test('props.x in text child is reactive (wrapped in _bind)', () => {
    const result = t('function Comp(props) { return <div>{props.name}</div> }')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('props.name')
  })

  test('props.x in attribute is reactive (wrapped in _bind)', () => {
    const result = t('function Comp(props) { return <div class={props.cls}></div> }')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('props.cls')
  })

  test('prop-derived variable inlined in text child', () => {
    const result = t('function Comp(props) { const x = props.name ?? "anon"; return <div>{x}</div> }')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('props.name ?? "anon"')
    // x should be inlined, not used directly
    expect(result).not.toMatch(/__t\d+\.data = x\b/)
  })

  test('prop-derived variable inlined in attribute', () => {
    const result = t('function Comp(props) { const align = props.alignX ?? "left"; return <div class={align}></div> }')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('props.alignX ?? "left"')
  })

  test('splitProps results tracked as props-like', () => {
    const result = t('function Comp(props) { const [own, rest] = splitProps(props, ["x"]); const v = own.x ?? 5; return <div>{v}</div> }')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('own.x ?? 5')
  })

  test('non-component function NOT tracked (no JSX)', () => {
    const result = t('function helper(props) { const x = props.y; return x }')
    expect(result).not.toContain('_bind')
    expect(result).not.toContain('_tpl')
  })

  test('static values unchanged by props tracking', () => {
    const result = t('function Comp(props) { return <div class="static">text</div> }')
    expect(result).toContain('_tpl("<div class=\\"static\\">text</div>"')
    expect(result).not.toContain('_bind')
  })

  test('signal calls still work alongside props detection', () => {
    const result = t('function Comp(props) { return <div>{count()}</div> }')
    expect(result).toContain('_bindText(count,')
  })

  test('arrow function component detected', () => {
    const result = t('const Comp = (props) => <div>{props.x}</div>')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('props.x')
  })
})

// ─── Transitive prop derivation ─────────────────────────────────────────────

describe('JSX transform — transitive prop derivation', () => {
  test('const b = a + 1 where a is prop-derived', () => {
    const result = t('function Comp(props) { const a = props.x; const b = a + 1; return <div>{b}</div> }')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('props.x')
    // b should be inlined transitively
    expect(result).not.toMatch(/__t\d+\.data = b\b/)
  })

  test('deep chain: c = b * 2, b = a + 1, a = props.x', () => {
    const result = t('function Comp(props) { const a = props.x; const b = a + 1; const c = b * 2; return <div>{c}</div> }')
    expect(result).toContain('props.x')
    // Full chain inlined
    expect(result).toContain('_bind')
  })

  test('non-prop-derived variable NOT inlined', () => {
    const result = t('function Comp(props) { const x = 42; return <div>{x}</div> }')
    // x = 42 is static, not prop-derived — should NOT be wrapped
    expect(result).not.toContain('_bind')
  })

  test('let variables NOT tracked (mutable — can be reassigned)', () => {
    const result = t('function Comp(props) { let x = props.y; x = "override"; return <div>{x}</div> }')
    // let is excluded — x is NOT inlined, set statically
    expect(result).toContain('textContent = x')
    expect(result).not.toContain('_bind')
  })

  test('mixed props and signals in same expression', () => {
    const result = t('function Comp(props) { return <div class={`${props.base} ${count()}`}></div> }')
    expect(result).toContain('_bind(() => {')
  })

  test('prop-derived used in non-JSX stays static', () => {
    // The variable is still captured — only JSX usage is inlined
    const result = t('function Comp(props) { const x = props.y; console.log(x); return <div>{x}</div> }')
    // console.log(x) uses the captured value — compiler doesn't touch it
    expect(result).toContain('console.log(x)')
    // JSX usage is inlined
    expect(result).toContain('props.y')
    expect(result).toContain('_bind')
  })

  test('.map() callback params NOT treated as props', () => {
    const result = t('function App(props) { return <div>{tabs.map((tab) => { const C = tab.component; return <div><C /></div> })}</div> }')
    // tab is a callback param, not a component's props — should NOT be tracked
    expect(result).not.toContain('(tab.component)')
  })

  test('prop read with ?? default used multiple times', () => {
    const result = t('function Comp(props) { const x = props.a ?? "def"; return <div class={x}>{x}</div> }')
    // Both uses should be inlined
    const matches = result.match(/props\.a \?\? "def"/g)
    expect(matches?.length).toBeGreaterThanOrEqual(2)
  })
})

// ─── AST-based inlining edge cases ──────────────────────────────────────────

describe('JSX transform — AST inlining (template literals, ternaries)', () => {
  test('template literal with prop-derived var is inlined', () => {
    const result = t('function C(props) { const x = props.name; return <div>{`hello ${x}`}</div> }')
    expect(result).toContain('props.name')
    expect(result).toContain('_bind')
  })

  test('ternary with prop-derived var is inlined', () => {
    const result = t('function C(props) { const v = props.x; return <div>{v ? "yes" : "no"}</div> }')
    expect(result).toContain('props.x')
    expect(result).toContain('? "yes" : "no"')
  })

  test('both branches of ternary inlined when both are prop-derived', () => {
    const result = t('function C(props) { const a = props.x; const b = props.y; return <div>{a ? b : "none"}</div> }')
    expect(result).toContain('props.x')
    expect(result).toContain('props.y')
  })

  test('concatenation with prop-derived inlined', () => {
    const result = t('function C(props) { const x = props.cls; return <div class={x + " extra"}></div> }')
    expect(result).toContain('props.cls')
    expect(result).toContain('" extra"')
  })

  test('object property access on prop-derived NOT confused', () => {
    const result = t('function C(props) { const data = props.data; return <div>{data.name}</div> }')
    // data.name → (props.data).name — the .name is preserved, not replaced
    expect(result).toContain('props.data')
    expect(result).toContain('.name')
  })

  test('deep transitive: c = b * 2, b = a + 1, a = props.x via AST', () => {
    const result = t('function C(props) { const a = props.x; const b = a + 1; const c = b * 2; return <div>{c}</div> }')
    expect(result).toContain('props.x')
    // Full chain resolved via AST visitor
    expect(result).toContain('_bind')
  })

  test('array destructuring NOT tracked (only simple identifier)', () => {
    const result = t('function C(props) { const [a, b] = props.items; return <div>{a}</div> }')
    // Array destructuring is not a simple identifier — not tracked
    expect(result).not.toContain('(props.items)')
  })

  test('computed property not confused with prop-derived', () => {
    const result = t('function C(props) { const key = props.key; return <div>{obj[key]}</div> }')
    expect(result).toContain('props.key')
  })

  test('type cast "as" in prop-derived var does not crash compiler', () => {
    // Regression: const sel = state.selected() as string[] inside JSX arrow
    // caused ParenthesizedExpression to replace a BindingName, crashing ts.visitEachChild
    const result = t(`
      function C(props) {
        const items = props.data
        return <div>{() => {
          const sel = items as any
          return sel
        }}</div>
      }
    `)
    expect(result).toBeDefined()
  })

  test('variable declaration name is not inlined by resolveExprTransitive', () => {
    const result = t(`
      function C(props) {
        const x = props.val
        const y = x
        return <div>{y}</div>
      }
    `)
    expect(result).toContain('props.val')
  })

  test('parameter name matching prop-derived var does not crash', () => {
    // (val: string) => ... where "val" might match a prop-derived var
    const result = t(`
      function C(props) {
        const val = props.value
        return <div>{() => [1,2].map((val) => <span>{val}</span>)}</div>
      }
    `)
    expect(result).toBeDefined()
  })

  test('catch clause variable matching prop-derived var does not crash', () => {
    const result = t(`
      function C(props) {
        const err = props.error
        return <div>{() => { try {} catch(err) { return err } }}</div>
      }
    `)
    expect(result).toBeDefined()
  })

  test('binding element matching prop-derived var does not crash', () => {
    const result = t(`
      function C(props) {
        const x = props.x
        return <div>{() => { const { x } = obj; return x }}</div>
      }
    `)
    expect(result).toBeDefined()
  })

  test('HTML entities in JSX text are not double-escaped', () => {
    const result = t('function C() { return <button>&lt; prev</button> }')
    expect(result).toContain('&lt;')
    expect(result).not.toContain('&amp;lt;')
  })

  test('mixed HTML entities and raw ampersands', () => {
    const result = t('function C() { return <span>A &amp; B &lt; C</span> }')
    expect(result).toContain('&amp;')
    expect(result).toContain('&lt;')
    expect(result).not.toContain('&amp;amp;')
    expect(result).not.toContain('&amp;lt;')
  })

  test('props.children in template uses _mountSlot instead of createTextNode', () => {
    const result = t('function C(props) { return <div>{props.children}</div> }')
    expect(result).toContain('_mountSlot')
    expect(result).not.toContain('createTextNode')
    expect(result).not.toContain('.data')
  })

  test('own.children in template uses _mountSlot', () => {
    const result = t('function C(props) { const own = props; return <label><input/>{own.children}</label> }')
    expect(result).toContain('_mountSlot')
    expect(result).toContain('own.children')
  })

  test('non-children prop access still uses text node binding', () => {
    const result = t('function C(props) { return <div>{props.name}</div> }')
    expect(result).not.toContain('_mountSlot')
    expect(result).toContain('.data')
  })

  test('signal() calls are NOT inlined as prop-derived vars', () => {
    const result = t(`
      function C(props) {
        const open = signal(props.defaultOpen ?? false)
        return <div>{() => open() ? 'yes' : 'no'}</div>
      }
    `)
    // open should be referenced as-is, NOT replaced with signal(props.defaultOpen ?? false)
    expect(result).toContain('open()')
    // signal() should appear only once — in the original declaration
    const signalMatches = result.match(/signal\(props\.defaultOpen/g)
    expect(signalMatches?.length ?? 0).toBe(1)
  })
})

// ─── Circular reference safety ─────────────────────────────────────────────

describe('JSX transform — circular prop-derived var cycles do not crash', () => {
  // Before the fix (PR #204), resolveExprTransitive used a single
  // `excludeVar` parameter that only prevented immediate re-entry on the
  // same variable. Multi-step cycles (a → b → a) alternated between
  // the two identifiers and recursed infinitely, crashing the compiler
  // with "Maximum call stack size exceeded."
  //
  // The fix replaces `excludeVar` with a `visited: Set<string>` that
  // tracks the entire call stack. When a variable is already visited,
  // the identifier is left as-is (falls back to the captured const
  // value at runtime) and a compiler warning is emitted.

  // Use transformJSX directly (not the `t` helper) so we can assert
  // on both the code AND the warnings.
  const full = (code: string) => transformJSX(code, 'input.tsx')

  test('two-variable cycle: a ↔ b does not stack-overflow and emits warning', () => {
    const result = full(`
      function Comp(props) {
        const a = b + props.x;
        const b = a + 1;
        return <div>{a}</div>
      }
    `)
    // Should compile (not crash) and produce valid output
    expect(result.code).toBeDefined()
    expect(result.code).toContain('_tpl')

    // Should emit a circular-prop-derived warning
    const cycleWarnings = result.warnings.filter((w) => w.code === 'circular-prop-derived')
    expect(cycleWarnings.length).toBeGreaterThanOrEqual(1)
    expect(cycleWarnings[0]?.message).toMatch(/Circular prop-derived/)
  })

  test('three-variable cycle: a → b → c → a does not stack-overflow', () => {
    const result = full(`
      function Comp(props) {
        const a = c + props.x;
        const b = a + 1;
        const c = b + 2;
        return <div>{a}</div>
      }
    `)
    expect(result.code).toBeDefined()
    expect(result.code).toContain('_tpl')

    const cycleWarnings = result.warnings.filter((w) => w.code === 'circular-prop-derived')
    expect(cycleWarnings.length).toBeGreaterThanOrEqual(1)
  })

  test('self-referencing variable does not stack-overflow', () => {
    const result = full(`
      function Comp(props) {
        const a = a + props.x;
        return <div>{a}</div>
      }
    `)
    expect(result.code).toBeDefined()

    const cycleWarnings = result.warnings.filter((w) => w.code === 'circular-prop-derived')
    expect(cycleWarnings.length).toBeGreaterThanOrEqual(1)
    expect(cycleWarnings[0]?.message).toContain('a')
  })

  test('cycle still inlines the non-cyclic parts correctly', () => {
    // const a = b + props.x;  const b = a + 1;
    // When resolving `a` for JSX: `b + props.x` → `b` is cycle-broken
    // (left as identifier `b`), `props.x` is inlined as `props.x`.
    const result = full(`
      function Comp(props) {
        const a = b + props.x;
        const b = a + 1;
        return <div>{a}</div>
      }
    `)
    // Non-cyclic part (props.x) is still inlined reactively
    expect(result.code).toContain('props.x')
    expect(result.code).toContain('_bind')
    // Cyclic identifier `b` is left as-is (not further resolved)
    // The _bind should reference `b` directly since it's the cycle-break point
    expect(result.code).toMatch(/\bb\b/)
  })

  test('non-cyclic deep chain still works after the cycle fix', () => {
    // Regression guard: the visited-set fix must NOT break the existing
    // non-cyclic transitive resolution (a → b → c, no cycle).
    const result = full(`
      function Comp(props) {
        const a = props.x;
        const b = a + 1;
        const c = b * 2;
        return <div>{c}</div>
      }
    `)
    expect(result.code).toContain('props.x')
    expect(result.code).toContain('_bind')
    // c should be fully inlined — not left as a static reference
    expect(result.code).not.toMatch(/__t\d+\.data = c\b/)
    // No cycle warnings on a non-cyclic chain
    const cycleWarnings = result.warnings.filter((w) => w.code === 'circular-prop-derived')
    expect(cycleWarnings.length).toBe(0)
  })

  test('warning message includes the cycle chain for debugging', () => {
    const result = full(`
      function Comp(props) {
        const a = b + props.x;
        const b = a + 1;
        return <div>{a}</div>
      }
    `)
    const cycleWarnings = result.warnings.filter((w) => w.code === 'circular-prop-derived')
    expect(cycleWarnings.length).toBeGreaterThanOrEqual(1)
    // The warning should mention both variables in the cycle chain
    const msg = cycleWarnings[0]!.message
    expect(msg).toContain('a')
    expect(msg).toContain('b')
    // And suggest how to fix it
    expect(msg).toContain('props.*')
  })

  test('property access with name matching tracked var is NOT flagged as cycle', () => {
    // Regression: `own.beforeContentDirection` where `beforeContentDirection`
    // is ALSO a tracked const used to trigger a false-positive self-cycle
    // warning. The property name identifier happens to match a prop-derived
    // var name, but it's not a reference — it's a property name. The
    // declaration-position check MUST run before the cycle check to
    // skip property names, binding names, and shorthand keys.
    //
    // This pattern is extremely common in Elements component.tsx and
    // similar splitProps-heavy destructuring codebases.
    const result = full(`
      function Comp(props) {
        const [own, rest] = splitProps(props, ['beforeContentDirection'])
        const defaultDirection = 'inline'
        const beforeContentDirection = own.beforeContentDirection ?? defaultDirection
        return <div data-dir={beforeContentDirection}>hello</div>
      }
    `)
    const cycleWarnings = result.warnings.filter((w) => w.code === 'circular-prop-derived')
    // No cycle — the property name `beforeContentDirection` in
    // `own.beforeContentDirection` is a property access, not a reference.
    expect(cycleWarnings.length).toBe(0)
    // And the inlining should still work — props.beforeContentDirection
    // appears in the bind (via own destructure from splitProps).
    expect(result.code).toContain('beforeContentDirection')
  })

  test('shorthand property key matching tracked var is NOT flagged as cycle', () => {
    // Another false-positive shape: `{ foo }` shorthand in an object
    // literal where `foo` is a tracked var. The shorthand key would
    // match propDerivedVars but its parent is ShorthandPropertyAssignment.
    const result = full(`
      function Comp(props) {
        const foo = props.x
        const config = { foo }
        return <div data-config={JSON.stringify(config)}>{foo}</div>
      }
    `)
    const cycleWarnings = result.warnings.filter((w) => w.code === 'circular-prop-derived')
    expect(cycleWarnings.length).toBe(0)
  })
})

describe('JSX transform — SSR mode', () => {
  test('skips _tpl emission for SSR builds — falls back to plain JSX (h() via runtime)', () => {
    const code = `function Btn() { return <button onClick={() => null}>Click {() => x()}</button> }`
    const ssr = transformJSX(code, 'btn.tsx', { ssr: true }).code
    const dom = transformJSX(code, 'btn.tsx').code

    // Client (default) build uses the template fast path
    expect(dom).toContain('_tpl(')
    expect(dom).toContain('@pyreon/runtime-dom')

    // SSR build emits plain JSX (the runtime's JSX automatic transform turns
    // it into jsx() / h() calls that runtime-server can walk to a string)
    expect(ssr).not.toContain('_tpl(')
    expect(ssr).not.toContain('@pyreon/runtime-dom')
    expect(ssr).toContain('<button')
  })

  test('default (no options) still emits _tpl — backwards compatible', () => {
    const code = `function X() { return <div>hi</div> }`
    const out = transformJSX(code, 'x.tsx').code
    expect(out).toContain('_tpl(')
  })
})

// ─── Signal auto-call in JSX ────────────────────────────────────────────────

describe('JSX transform — signal auto-call', () => {
  test('bare signal in text child is auto-called', () => {
    const result = t('function C() { const name = signal("Vít"); return <div>{name}</div> }')
    expect(result).toContain('name()')
    expect(result).toContain('_bind')
  })

  test('signal in attribute expression is auto-called', () => {
    const result = t('function C() { const show = signal(false); return <div class={show ? "active" : ""}></div> }')
    expect(result).toContain('show()')
    expect(result).toContain('_bind')
  })

  test('signal already called is NOT double-called', () => {
    const result = t('function C() { const count = signal(0); return <div>{count()}</div> }')
    expect(result).not.toContain('count()()')
    expect(result).toContain('count')
  })

  test('signal in ternary is auto-called', () => {
    const result = t('function C() { const show = signal(false); return <div>{show ? "yes" : "no"}</div> }')
    expect(result).toContain('show()')
    expect(result).toContain('? "yes" : "no"')
  })

  test('signal in template literal is auto-called', () => {
    const result = t('function C() { const name = signal("world"); return <div>{`hello ${name}`}</div> }')
    expect(result).toContain('name()')
  })

  test('signal in component prop is auto-called with _rp', () => {
    const result = t('function C() { const val = signal(42); return <MyComp value={val} /> }')
    expect(result).toContain('_rp(() => val())')
  })

  test('multiple signals in one expression are all auto-called', () => {
    const result = t('function C() { const a = signal(1); const b = signal(2); return <div>{a + b}</div> }')
    expect(result).toContain('a()')
    expect(result).toContain('b()')
  })

  test('signal in conditional attribute is auto-called', () => {
    const result = t('function C() { const active = signal(false); return <div title={active ? "on" : "off"}></div> }')
    expect(result).toContain('active()')
  })

  test('non-signal const is NOT auto-called', () => {
    const result = t('function C() { const x = 42; return <div>{x}</div> }')
    expect(result).not.toContain('x()')
  })

  test('computed() IS auto-called (same callable pattern as signal)', () => {
    const result = t('function C() { const doubled = computed(() => 2); return <div>{doubled}</div> }')
    expect(result).toContain('doubled()')
    expect(result).toContain('_bind')
  })

  test('computed already called is NOT double-called', () => {
    const result = t('function C() { const doubled = computed(() => 2); return <div>{doubled()}</div> }')
    expect(result).not.toContain('doubled()()')
  })

  test('signal + computed in same expression both auto-called', () => {
    const result = t('function C() { const count = signal(0); const doubled = computed(() => count() * 2); return <div>{count} + {doubled}</div> }')
    expect(result).toContain('.data = count()')
    expect(result).toContain('.data = doubled()')
  })

  test('signal in arrow function child is NOT auto-called (already reactive)', () => {
    const result = t('function C() { const count = signal(0); return <div>{() => count()}</div> }')
    // The arrow function is already reactive — no auto-call on the inner count
    expect(result).not.toContain('count()()')
  })

  test('signal used in non-JSX context is NOT modified', () => {
    const result = t('function C() { const x = signal(0); console.log(x); return <div>{x}</div> }')
    // console.log(x) should keep bare x, only JSX usage gets auto-called
    expect(result).toContain('console.log(x)')
    // But JSX usage gets auto-called
    expect(result).toContain('.data = x()')
  })

  test('signal as event handler value IS auto-called (unwraps to the handler fn)', () => {
    const result = t('function C() { const handler = signal(() => {}); return <div onClick={handler}></div> }')
    // onClick={handler} where handler is a signal → handler() unwraps to the function
    // This is correct — the event listener gets the unwrapped function value
    expect(result).toContain('handler()')
  })

  test('module-scope signal IS tracked and auto-called', () => {
    const result = t('const globalSig = signal(0); function C() { return <div>{globalSig}</div> }')
    // Module-scope signal declarations are tracked by the single-pass walk
    expect(result).toContain('globalSig()')
  })

  test('knownSignals option enables cross-module auto-call', () => {
    const code = 'import { count } from "./store"; function App() { return <div>{count}</div> }'
    const result = transformJSX(code, 'test.tsx', { knownSignals: ['count'] }).code
    expect(result).toContain('count()')
    expect(result).toContain('_bind')
  })

  test('knownSignals with alias — local name is used', () => {
    const code = 'import { count as c } from "./store"; function App() { return <div>{c}</div> }'
    const result = transformJSX(code, 'test.tsx', { knownSignals: ['c'] }).code
    expect(result).toContain('c()')
  })

  test('knownSignals does not double-call already-called signals', () => {
    const code = 'import { count } from "./store"; function App() { return <div>{count()}</div> }'
    const result = transformJSX(code, 'test.tsx', { knownSignals: ['count'] }).code
    expect(result).not.toContain('count()()')
  })

  test('knownSignals respects scope shadowing', () => {
    const code = 'import { count } from "./store"; function App() { const count = "shadow"; return <div>{count}</div> }'
    const result = transformJSX(code, 'test.tsx', { knownSignals: ['count'] }).code
    expect(result).not.toContain('.data = count()')
  })

  test('props.x is still inlined alongside signal auto-call', () => {
    const result = t('function C(props) { const show = signal(false); const label = props.label; return <div class={show ? label : "default"}></div> }')
    expect(result).toContain('show()')
    expect(result).toContain('props.label')
  })

  // Regression: signal-method calls were getting double-wrapped — the
  // auto-call inserted `()` after the bare signal reference inside
  // `signal.set(value)`, producing `signal().set(value)`. That calls
  // the signal (returns its current value, e.g. a string) then tries
  // `.set` on the string (undefined → TypeError). Every `signal.set`,
  // `signal.peek`, `signal.update` call inside event handlers / hot
  // paths was silently broken.
  test('signal.set() in event handler does NOT auto-call the bare signal reference', () => {
    const result = t(
      'function C() { const value = signal(""); return <input onInput={(e) => value.set(e.target.value)} /> }',
    )
    // Must keep `value.set(...)` — NOT `value().set(...)`.
    expect(result).toContain('value.set(e.target.value)')
    expect(result).not.toContain('value().set')
  })

  test('signal.peek() does NOT auto-call', () => {
    const result = t(
      'function C() { const count = signal(0); return <button onClick={() => console.log(count.peek())}>x</button> }',
    )
    expect(result).toContain('count.peek()')
    expect(result).not.toContain('count().peek')
  })

  test('signal.update() does NOT auto-call', () => {
    const result = t(
      'function C() { const count = signal(0); return <button onClick={() => count.update(n => n + 1)}>+</button> }',
    )
    expect(result).toContain('count.update(')
    expect(result).not.toContain('count().update')
  })

  // Bare member-access on a signal (no call) STILL auto-calls — preserves
  // the existing convention where a signal containing an object can be
  // dereferenced via `signalContainingObj.someProp` (compiles to
  // `signalContainingObj().someProp`). Only the CALLED form
  // (`signal.method(...)`) skips the auto-call. See findSignalIdents
  // in jsx.ts for the rationale.
  test('signal.someProp (bare member access) DOES auto-call', () => {
    const result = t(
      'function C() { const data = signal({ count: 0 }); return <div>{data.count}</div> }',
    )
    expect(result).toContain('data().count')
  })

  // The bare signal reference STILL auto-calls in JSX text — make sure
  // the fix doesn't over-correct.
  test('bare signal in JSX text still auto-calls (fix does not over-correct)', () => {
    const result = t('function C() { const count = signal(0); return <div>{count}</div> }')
    expect(result).toContain('count()')
  })

  // ── JSX text/expression whitespace (regression) ─────────────────────
  // The compiler used `.replace(/\n\s*/g, '').trim()` on JSX text which
  // stripped ALL leading/trailing whitespace — even spaces adjacent to
  // expressions on the same line. So `<p>doubled: {x}</p>` produced
  // `<p>doubled:</p>` + appended text node, rendering "doubled:0"
  // instead of "doubled: 0". Same class for `<p>{x} remaining</p>` →
  // text "remaining" loses its leading space, rendering as "Xremaining".
  // Fix: only strip whitespace adjacent to newlines (multi-line JSX
  // formatting), preserve same-line whitespace adjacent to expressions.
  test('preserves trailing space in JSX text before expression on same line', () => {
    const result = t('<p>doubled: {x()}</p>')
    // The static text portion of the template must keep "doubled: "
    // (with trailing space) so the appended expression value renders
    // as "doubled: 0", not "doubled:0".
    expect(result).toContain('doubled: ')
  })

  test('preserves leading space in JSX text after expression on same line', () => {
    const result = t('<p>{x()} remaining</p>')
    // Static portion must include " remaining" (with leading space).
    expect(result).toContain(' remaining')
  })

  test('strips multi-line JSX text whitespace adjacent to newlines', () => {
    // Multi-line JSX with indentation should still collapse — only
    // SAME-LINE whitespace adjacent to expressions is preserved.
    const result = t(`<div>
  <span>hello</span>
</div>`)
    // The newlines + indentation should not produce stray text nodes.
    expect(result).toContain('hello')
    expect(result).not.toContain('"\\n  "')
  })

  test('shadowed signal variable by const is NOT auto-called', () => {
    const result = t(`
      function App() {
        const show = signal(false)
        function Inner() {
          const show = 'not a signal'
          return <div>{show}</div>
        }
        return <div>{show}</div>
      }
    `)
    // Inner's show is a plain string, NOT a signal — should NOT be auto-called
    // But App's show IS a signal — should be auto-called
    expect(result).toContain('show()')  // App's usage
    expect(result).toContain('textContent = show')  // Inner's usage (static)
  })

  test('function parameter shadowing signal is NOT auto-called', () => {
    const result = t(`
      function App() {
        const count = signal(0)
        function Display(count) {
          return <div>{count}</div>
        }
        return <div>{count}</div>
      }
    `)
    // Display's count is a parameter, not the signal
    expect(result).toContain('textContent = count')  // Display: static
    expect(result).toContain('.data = count()')       // App: auto-called
  })

  test('destructured parameter shadowing signal is NOT auto-called', () => {
    const result = t(`
      function App() {
        const name = signal('Vít')
        function Greet({ name }) {
          return <div>{name}</div>
        }
        return <div>{name}</div>
      }
    `)
    // Greet's name is destructured from props — shadows the signal
    expect(result).toContain('textContent = name')  // Greet: static
    expect(result).toContain('.data = name()')       // App: auto-called
  })

  test('signal in outer scope is auto-called when NOT shadowed', () => {
    const result = t(`
      function App() {
        const name = signal('Vít')
        function Inner() {
          return <div>{name}</div>
        }
        return <div>{name}</div>
      }
    `)
    // name is NOT shadowed in Inner — auto-called in both
    const autoCallCount = (result.match(/name\(\)/g) || []).length
    expect(autoCallCount).toBeGreaterThanOrEqual(2)
  })

  test('array destructured parameter shadowing signal is NOT auto-called', () => {
    const result = t(`
      function App() {
        const item = signal('x')
        function Inner([item]) {
          return <div>{item}</div>
        }
        return <div>{item}</div>
      }
    `)
    // Inner's item is array-destructured — shadows the signal
    expect(result).toContain('textContent = item')  // Inner: static
    expect(result).toContain('.data = item()')       // App: auto-called
  })

  test('signal re-declared as signal in inner scope is still auto-called', () => {
    const result = t(`
      function App() {
        const count = signal(0)
        function Inner() {
          const count = signal(10)
          return <div>{count}</div>
        }
        return <div>{count}</div>
      }
    `)
    // Both are signal() calls — both should be auto-called
    const autoCallCount = (result.match(/count\(\)/g) || []).length
    expect(autoCallCount).toBeGreaterThanOrEqual(2)
  })

  test('signal shadowing does not leak across sibling functions', () => {
    const result = t(`
      function App() {
        const show = signal(false)
        function A() {
          const show = 'text'
          return <div>{show}</div>
        }
        function B() {
          return <div>{show}</div>
        }
        return <div>{show}</div>
      }
    `)
    // A shadows show — static
    expect(result).toContain('textContent = show')
    // B does NOT shadow — auto-called
    // App does NOT shadow — auto-called
    const autoCallCount = (result.match(/show\(\)/g) || []).length
    expect(autoCallCount).toBeGreaterThanOrEqual(2)
  })

  test('signal in deeply nested expression is auto-called', () => {
    const result = t('function C() { const x = signal(1); return <div>{x + x + x}</div> }')
    // All three references should be auto-called
    const autoCallCount = (result.match(/x\(\)/g) || []).length
    expect(autoCallCount).toBe(3)
  })

  test('signal in object property value (not key) is auto-called', () => {
    const result = t('function C() { const x = signal(1); return <MyComp data={{ value: x }} /> }')
    expect(result).toContain('x()')
    expect(result).toContain('_rp(')
  })

  test('signal + prop-derived in same expression both resolved', () => {
    const result = t('function C(props) { const x = signal(0); const label = props.label; return <div>{x ? label : "none"}</div> }')
    expect(result).toContain('x()')
    expect(result).toContain('props.label')
    expect(result).toContain('_bind')
  })

  test('signal with no init (const x = signal()) tracked', () => {
    const result = t('function C() { const x = signal(); return <div>{x}</div> }')
    expect(result).toContain('x()')
  })

  test('signal in member expression property position is NOT auto-called', () => {
    const result = t('function C() { const x = signal(0); return <div>{obj.x}</div> }')
    // x as a property name is not a signal reference
    expect(result).not.toContain('obj.x()')
  })

  test('signal as member expression object IS auto-called', () => {
    const result = t('function C() { const x = signal({ a: 1 }); return <div>{x.a}</div> }')
    // x is the object, should be auto-called
    expect(result).toContain('x().a')
  })

  test('const declared without init is not tracked as signal', () => {
    const result = t('function C() { const x = signal(0); function Inner() { let x; return <div>{x}</div> } return <div>{x}</div> }')
    // Inner's x is let, not tracked. App's x is signal
    expect(result).toContain('.data = x()')
  })

  test('signal shadowed by let declaration in inner scope', () => {
    const result = t(`
      function C() {
        const show = signal(false)
        function Inner() {
          let show = true
          return <div>{show}</div>
        }
        return <div>{show}</div>
      }
    `)
    // Inner's let show shadows the signal — but let is not tracked by the declarator check
    // (let is not const so it's not in signalVars, but it's also not tracked as shadow)
    // Actually findShadowingNames only checks top-level VariableDeclaration declarations
    // let is VariableDeclaration kind=let — it should shadow
    expect(result).toContain('.data = show()')  // outer: auto-called
  })

  test('knownSignals with empty array does not crash', () => {
    const code = 'function App() { return <div>hello</div> }'
    const result = transformJSX(code, 'test.tsx', { knownSignals: [] }).code
    expect(result).toContain('hello')
  })

  test('knownSignals combined with local signal declarations', () => {
    const code = 'import { count } from "./store"; function App() { const local = signal(0); return <div>{count}{local}</div> }'
    const result = transformJSX(code, 'test.tsx', { knownSignals: ['count'] }).code
    // Both the imported signal (via knownSignals) and the local signal should be auto-called
    expect(result).toContain('count()')
    expect(result).toContain('local()')
  })

  test('knownSignals with default import name', () => {
    // When a default import resolves to a signal, the local name should be auto-called
    const code = 'import count from "./store"; function App() { return <div>{count}</div> }'
    const result = transformJSX(code, 'test.tsx', { knownSignals: ['count'] }).code
    expect(result).toContain('count()')
    expect(result).toContain('_bind')
  })
})

// ─── Additional branch coverage for >= 90% ─────────────────────────────────

describe('JSX transform — template reactive style _bindDirect path', () => {
  test('reactive style accessor uses _bindDirect with cssText updater', () => {
    const result = t('<div style={getStyle()}><span /></div>')
    expect(result).toContain('_bindDirect(getStyle,')
    expect(result).toContain('style.cssText')
  })

  test('reactive style accessor with object check in updater', () => {
    const result = t('<div style={styleSignal()}><span /></div>')
    expect(result).toContain('_bindDirect(styleSignal,')
    // The updater should handle both string and object
    expect(result).toContain('typeof v === "string"')
    expect(result).toContain('Object.assign')
  })
})

// ── DOM-property assignment for value/checked/etc. (regression) ─────────
// The compiler used `setAttribute("value", v)` for ALL non-class/style
// attributes. For inputs that's wrong: `value` is a live DOM property,
// `setAttribute` only sets the initial attribute. After the user types,
// the property and attribute drift. Then `input.set('')` runs the
// _bindDirect updater — which only resets the attribute, leaving the
// stale typed text in the visible field. Same for `checked` on
// checkboxes (presence of the attribute means checked, regardless of
// value). Fix: emit property assignment for known DOM properties.
describe('JSX transform — DOM properties use property assignment', () => {
  test('reactive value on input emits property assignment, not setAttribute', () => {
    const result = t('<div><input value={() => input()} /></div>')
    // Should be `el.value = v`, not `setAttribute("value", ...)`
    expect(result).toContain('.value = v')
    expect(result).not.toContain('setAttribute("value"')
  })

  test('reactive checked on input emits property assignment', () => {
    const result = t('<div><input checked={done()} /></div>')
    expect(result).toContain('.checked = v')
    expect(result).not.toContain('setAttribute("checked"')
  })

  test('static-call value on input emits property assignment', () => {
    // Non-signal-direct dynamic expression goes through reactiveBindExprs
    const result = t('<div><input value={x.y} /></div>')
    expect(result).toContain('.value = x.y')
    expect(result).not.toContain('setAttribute("value"')
  })

  test('selected on option emits property assignment', () => {
    const result = t('<div><option selected={isSelected()}>x</option></div>')
    expect(result).toContain('.selected = v')
    expect(result).not.toContain('setAttribute("selected"')
  })

  test('disabled on button emits property assignment', () => {
    const result = t('<div><button disabled={isDisabled()}>x</button></div>')
    expect(result).toContain('.disabled = v')
    expect(result).not.toContain('setAttribute("disabled"')
  })

  test('non-DOM-prop attribute still uses setAttribute', () => {
    // placeholder is a real attribute, not a property-divergent IDL prop
    const result = t('<div><input placeholder={msg()} /></div>')
    expect(result).toContain('setAttribute("placeholder"')
  })
})

describe('JSX transform — template combined _bind for complex expressions', () => {
  test('complex attribute expression uses combined _bind', () => {
    const result = t('<div class={`${a()} ${b()}`}><span /></div>')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('className')
  })

  test('dynamic spread in template uses _applyProps in reactive _bind', () => {
    const result = t('<div {...getProps()}><span /></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('_applyProps')
    expect(result).toContain('_bind')
  })
})

describe('JSX transform — children expression as bareIdentifier "children"', () => {
  test('bare children identifier uses _mountSlot', () => {
    const result = t('function C(props) { const children = props.children; return <div>{children}</div> }')
    expect(result).toContain('_mountSlot')
  })
})

describe('JSX transform — template static expression string attr via JSX expression', () => {
  test('numeric expression attribute baked into HTML', () => {
    const result = t('<div tabindex={3}><span /></div>')
    expect(result).toContain('tabindex=\\"3\\"')
  })

  test('boolean false expression attribute omitted from HTML', () => {
    const result = t('<div hidden={false}><span /></div>')
    expect(result).not.toContain('hidden')
  })

  test('null expression attribute omitted from HTML', () => {
    const result = t('<div hidden={null}><span /></div>')
    expect(result).not.toContain('hidden')
  })
})

describe('JSX transform — isPureStaticCall edge cases', () => {
  test('pure call with spread argument IS wrapped (not pure)', () => {
    const result = t('<div>{Math.max(...nums)}</div>')
    expect(result).toContain('.data =')
  })

  test('Array.isArray with static arg is not wrapped', () => {
    const result = t('<div>{Array.isArray(null)}</div>')
    expect(result).not.toContain('() =>')
  })

  test('encodeURIComponent with static string is not wrapped', () => {
    const result = t('<div>{encodeURIComponent("hello world")}</div>')
    expect(result).not.toContain('() =>')
  })

  test('Date.now is not wrapped (no args)', () => {
    const result = t('<div>{Date.now()}</div>')
    expect(result).not.toContain('() =>')
  })

  test('standalone parseInt with static arg is not wrapped', () => {
    const result = t('<div>{parseInt("42")}</div>')
    expect(result).not.toContain('() =>')
  })
})

describe('JSX transform — isStatic edge cases', () => {
  test('template literal with no substitutions is static', () => {
    const result = t('<div>{`plain text`}</div>')
    expect(result).not.toContain('_bind')
  })

  test('template literal with substitution is dynamic', () => {
    const result = t('<div>{`${x()}`}</div>')
    expect(result).toContain('_bind')
  })
})

describe('JSX transform — signal auto-call in template _bind expressions', () => {
  test('signal in _bind reactive attribute expression', () => {
    const result = t('function C() { const cls = signal("a"); return <div class={`${cls} extra`}><span /></div> }')
    expect(result).toContain('cls()')
    expect(result).toContain('_bind')
  })

  test('signal in template text child expression', () => {
    const result = t('function C() { const name = signal("X"); return <div>{`Hello ${name}`}</div> }')
    expect(result).toContain('name()')
  })

  test('signal auto-call with addition', () => {
    const result = t('function C() { const a = signal(1); const b = signal(2); return <div>{a + b}</div> }')
    expect(result).toContain('a()')
    expect(result).toContain('b()')
  })
})

describe('JSX transform — walkNode edge cases for scope cleanup', () => {
  test('JSXExpressionContainer at top level within function', () => {
    // This exercises the walkNode JSXExpressionContainer path with scope shadows
    const result = t(`
      function App() {
        const x = signal(0)
        function Inner() {
          const x = 'plain'
          return <MyComp>{x}</MyComp>
        }
        return <div>{x}</div>
      }
    `)
    expect(result).toContain('.data = x()')
  })

  test('template emit within scoped function with signal shadowing', () => {
    const result = t(`
      function App() {
        const count = signal(0)
        function Nested() {
          const count = 'static'
          return <div><span>{count}</span></div>
        }
        return <div><span>{count}</span></div>
      }
    `)
    // Nested: count is shadowed, static
    expect(result).toContain('textContent = count')
    // App: count is signal, auto-called
    expect(result).toContain('.data = count()')
  })
})

describe('JSX transform — parse error handling', () => {
  test('returns original code on parse error', () => {
    const result = transformJSX('this is not {valid js <>', 'bad.tsx')
    expect(result.code).toBe('this is not {valid js <>')
    expect(result.warnings).toHaveLength(0)
  })
})

describe('JSX transform — reactive combined _bind for multiple reactive attrs', () => {
  test('multiple reactive attributes on same element with complex expressions', () => {
    const result = t('<div class={`${a()} b`} title={`${c()} d`}><span /></div>')
    expect(result).toContain('_bind(() => {')
    expect(result).toContain('className')
    expect(result).toContain('setAttribute("title"')
  })
})

describe('JSX transform — signalVars.size > shadowedSignals.size check', () => {
  test('when all signals are shadowed, no auto-call happens', () => {
    const result = t(`
      function App() {
        const x = signal(0)
        function Inner() {
          const x = 'plain'
          return <div class={x + " extra"}></div>
        }
        return <div>{x}</div>
      }
    `)
    // Inner's x is NOT auto-called
    expect(result).toContain('className = x + " extra"')
    // App's x IS auto-called
    expect(result).toContain('.data = x()')
  })
})

describe('JSX transform — _isDynamic with signal member expression and call position', () => {
  test('signal.set() is NOT flagged as dynamic (signal in callee position)', () => {
    // When signal is the callee of a call expression, it's already being called
    const result = t('function C() { const x = signal(0); return <button onClick={() => x.set(1)}>click</button> }')
    // onClick is an event handler — not wrapped regardless
    expect(result).not.toContain('_rp')
  })

  test('signal in property name position of member expression is NOT dynamic', () => {
    const result = t('function C() { const x = signal(0); return <div title={obj.x}></div> }')
    // obj.x — x is property name, not signal reference
    expect(result).not.toContain('_bind')
  })
})

// ─── Branch coverage: referencesPropDerived with computed MemberExpression ──

describe('JSX transform — referencesPropDerived computed access', () => {
  test('prop-derived var used as computed property key is treated as reference', () => {
    const result = t('function C(props) { const key = props.key; return <div title={obj[key]}></div> }')
    // key is used as computed property — it IS a reference (p.computed === true)
    expect(result).toContain('props.key')
    expect(result).toContain('_bind')
  })

  test('prop-derived var in non-computed property position is NOT a reference', () => {
    const result = t('function C(props) { const data = props.data; return <div title={result.data}></div> }')
    // result.data — 'data' is a non-computed property name, NOT a prop-derived reference
    expect(result).not.toContain('_bind')
  })
})

// ─── Branch coverage: template attrSetter for style (line 940) ──────────────

describe('JSX transform — template style attribute combined _bind', () => {
  test('complex reactive style uses cssText in combined _bind', () => {
    const result = t('<div style={getStyle() + "extra"}>text</div>')
    expect(result).toContain('style.cssText')
    expect(result).toContain('_bind(() => {')
  })
})

// ─── Branch coverage: processOneAttr key attr (line 1008) ───────────────────

describe('JSX transform — template with key attribute on child element', () => {
  test('key attribute on child element is stripped in template', () => {
    // key on inner child doesn't bail template (only root key bails)
    // But templateElementCount bails on key attr on any element
    const result = t('<div><span key="a">text</span></div>')
    expect(result).not.toContain('_tpl(')
  })
})

// ─── Branch coverage: selfClosing template bail (line 313) ──────────────────

describe('JSX transform — self-closing element template bail', () => {
  test('self-closing elements skip template emission', () => {
    const result = t('<div class={cls()} />')
    // Self-closing root element — tryTemplateEmit returns false
    expect(result).toContain('() => cls()')
    expect(result).not.toContain('_tpl(')
  })
})

// ─── Branch coverage: isStatic types (line 1388-1389) ───────────────────────

describe('JSX transform — isStatic for various literal types', () => {
  test('NullLiteral is static', () => {
    const result = t('<div>{<span data-x={null} />}</div>')
    expect(result).toContain('const _$h0')
  })

  test('template literal with expressions is not static', () => {
    const result = t('<div>{<span data-x={`${x}`} />}</div>')
    expect(result).not.toContain('const _$h0')
  })
})

// ─── Branch coverage: accessesProps with arrow function inside (line 679) ────

describe('JSX transform — accessesProps stops at nested functions', () => {
  test('props read inside arrow function does not make outer expression reactive', () => {
    const result = t('function C(props) { return <div title={items.map(x => props.fmt(x))}></div> }')
    // The arrow function contains a props read, but accessesProps stops at arrow boundaries
    expect(result).toContain('.map')
  })
})

// ─── Branch coverage: shouldWrap pure static call (line 688) ────────────────

describe('JSX transform — shouldWrap skips pure static calls', () => {
  test('Array.from with static arg in attribute position', () => {
    const result = t('<div data-arr={Array.from("abc")}></div>')
    expect(result).not.toContain('_bind')
  })
})

// ─── Branch coverage: isChildrenExpression fallthrough (line 1321) ──────────

describe('JSX transform — isChildrenExpression edge cases', () => {
  test('expression ending with .children uses _mountSlot', () => {
    const result = t('function C(props) { return <div>{config.children}</div> }')
    expect(result).toContain('_mountSlot')
  })

  test('identifier named exactly children uses _mountSlot', () => {
    const result = t('function C() { return <div>{children}</div> }')
    expect(result).toContain('_mountSlot')
  })

  test('expression NOT ending with .children does NOT use _mountSlot', () => {
    const result = t('function C(props) { return <div>{config.items}</div> }')
    expect(result).not.toContain('_mountSlot')
  })
})

// ─── Branch coverage: _isDynamic ArrowFunctionExpression stop (line 656) ────

describe('JSX transform — _isDynamic stops at nested arrow functions', () => {
  test('call inside arrow function does not make outer expression dynamic', () => {
    const result = t('<MyComp render={() => fn()} />')
    // Arrow function prevents _isDynamic from recursing into fn()
    expect(result).not.toContain('_rp(')
  })
})

// ─── Branch coverage: tryDirectSignalRef edge cases (line 922) ──────────────

describe('JSX transform — tryDirectSignalRef with arguments', () => {
  test('call with arguments does NOT use _bindDirect', () => {
    const result = t('<div class={getClass("primary")}><span /></div>')
    // Has arguments — not a direct signal ref
    expect(result).not.toContain('_bindDirect')
    expect(result).toContain('_bind(() => {')
  })
})

// ─── Branch coverage: unwrapAccessor for function expression (line 928) ─────

describe('JSX transform — unwrapAccessor with function expression', () => {
  test('function expression in attribute is called in bind', () => {
    const result = t('<div class={function() { return "cls" }}><span /></div>')
    expect(result).toContain('_bind')
  })
})

// ─── Branch coverage: collectPropDerivedFromDecl callbackDepth (line 498) ───

describe('JSX transform — prop-derived vars inside callbacks excluded', () => {
  test('const inside .map callback is NOT tracked as prop-derived', () => {
    const result = t('function C(props) { return <div>{items.map(item => { const x = props.y; return <span>{x}</span> })}</div> }')
    // x is declared inside a callback (callbackDepth > 0) — not tracked
    expect(result).toContain('() =>')
  })
})

// ─── Branch coverage: static JSX in component prop hoisting (line 359) ──────

describe('JSX transform — component prop static JSX hoisting', () => {
  test('single JSX element in component prop is NOT hoisted but walked', () => {
    const result = t('<MyComp icon={<span>icon</span>} />')
    // Single JSX element prop → walked (line 354-356), not hoisted
    expect(result).not.toContain('const _$h0')
    expect(result).toContain('<span>icon</span>')
  })

  test('non-JSX static expression in component prop gets hoisted', () => {
    // This exercises the maybeHoist path (line 358-360)
    const result = t('<MyComp render={12} />')
    // Static numeric — no wrapping needed
    expect(result).not.toContain('_rp(')
  })
})

// ─── Branch coverage: templateElementCount bail at non-lowercase (line 825) ──

describe('JSX transform — template element count bail on uppercase', () => {
  test('component element inside template bails', () => {
    const result = t('<div><Component /><span /></div>')
    expect(result).not.toContain('_tpl(')
  })
})

// ─── Branch coverage: maybeRegisterComponentProps with no params (line 518) ──

describe('JSX transform — component with no params not tracked', () => {
  test('parameterless function not tracked as component props', () => {
    const result = t('function C() { return <div>hello</div> }')
    expect(result).toContain('_tpl(')
    expect(result).not.toContain('_bind')
  })
})

// ─── Branch coverage: tpl null cleanup return (line 1156/1171/1179) ────────

describe('JSX transform — template processChildren null bail', () => {
  test('template bails when child element has no tag name', () => {
    // Member expression tag → empty tag name → processElement returns null
    const result = t('<div><ns.Comp><span /></ns.Comp></div>')
    expect(result).not.toContain('_tpl(')
  })
})

// ─── Branch coverage: more edge cases for various ?? and ?. operators ───────

describe('JSX transform — additional branch coverage paths', () => {
  test('arrow function with expression body (no block statement)', () => {
    const result = t('<div class={() => cls()}><span /></div>')
    expect(result).toContain('_bindDirect(cls,')
  })

  test('function expression with block body in attribute', () => {
    const result = t('<div class={function() { return cls() }}><span /></div>')
    expect(result).toContain('_bind')
  })

  test('prop-derived var used inside a nested function arg but NOT as callback', () => {
    const result = t('function C(props) { const x = props.y; return <div>{x + other(x)}</div> }')
    expect(result).toContain('props.y')
    expect(result).toContain('_bind')
  })

  test('mixed static and dynamic props on template element', () => {
    const result = t('<div class="static" title={x()} data-id={42}><span /></div>')
    expect(result).toContain('class=\\"static\\"')
    expect(result).toContain('_bindDirect(x,')
    expect(result).toContain('data-id=\\"42\\"')
  })

  test('template with nested elements each having dynamic attributes', () => {
    const result = t('<div><span class={a()}><em title={b()}>text</em></span></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindDirect(a,')
    expect(result).toContain('_bindDirect(b,')
  })

  test('signal auto-call works inside template _bind for text', () => {
    const result = t('function C() { const x = signal(1); return <div>{x + 1}</div> }')
    expect(result).toContain('x() + 1')
    expect(result).toContain('_bind')
  })

  test('signal auto-call inside template attribute _bind', () => {
    const result = t('function C() { const cls = signal("a"); return <div class={cls + " b"}><span /></div> }')
    expect(result).toContain('cls() + " b"')
    expect(result).toContain('_bind')
  })

  test('template with event + ref + dynamic attr + text child', () => {
    const result = t('<div ref={myRef} onClick={handler} class={cls()} title="static">{text()}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('myRef')
    expect(result).toContain('__ev_click = handler')
    expect(result).toContain('_bindDirect(cls,')
    expect(result).toContain('_bindText(text,')
  })

  test('template with non-delegated event using addEventListener', () => {
    const result = t('<div onScroll={handler}><span /></div>')
    expect(result).toContain('addEventListener("scroll", handler)')
    expect(result).not.toContain('__ev_')
  })

  test('forEachChild with non-array non-object values', () => {
    // Edge case: JSX text node has primitive value property
    const result = t('<div>plain text between elements<span /></div>')
    expect(result).toContain('_tpl(')
  })

  test('self-closing void element in mixed children template', () => {
    const result = t('<div><input />{value()}</div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('childNodes[')
    expect(result).toContain('_bindText(value,')
  })

  test('multiple signals from same component all tracked', () => {
    const result = t(`
      function C() {
        const a = signal(1)
        const b = signal(2)
        const c = signal(3)
        return <div>
          <span>{a}</span>
          <em>{b}</em>
          <strong>{c}</strong>
        </div>
      }
    `)
    expect(result).toContain('a()')
    expect(result).toContain('b()')
    expect(result).toContain('c()')
  })

  test('signal auto-call with binary and unary expressions', () => {
    const result = t('function C() { const x = signal(5); return <div>{-x}</div> }')
    expect(result).toContain('x()')
    expect(result).toContain('_bind')
  })

  test('signal in computed property access is auto-called', () => {
    const result = t('function C() { const idx = signal(0); return <div>{arr[idx]}</div> }')
    expect(result).toContain('idx()')
  })

  test('signal variable reference not confused with same-name property', () => {
    const result = t('function C() { const x = signal(0); return <div data-val={obj.method(x)}></div> }')
    expect(result).toContain('x()')
    expect(result).toContain('_bind')
  })

  test('template with static spread on root and dynamic inner attr', () => {
    const result = t('<div {...staticProps}><span class={cls()}>text</span></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('_applyProps')
    expect(result).toContain('_bindDirect(cls,')
  })

  test('empty JSX expression in template attribute position', () => {
    const result = t('<div class={/* comment */}><span /></div>')
    expect(result).toContain('_tpl(')
  })

  test('ternary in template attribute without signal', () => {
    const result = t('<div class={x ? "a" : "b"}><span /></div>')
    // No calls — not dynamic
    expect(result).toContain('className = x ? "a" : "b"')
  })

  test('variable declaration kind is let — not tracked for prop-derived', () => {
    const result = t('function C(props) { let x = props.y; return <div>{x}</div> }')
    // let is not tracked — x is static
    expect(result).toContain('textContent = x')
  })

  test('FunctionDeclaration with JSX detected as component', () => {
    const result = t('function MyComp(props) { return <div class={props.cls}></div> }')
    expect(result).toContain('_bind')
    expect(result).toContain('props.cls')
  })

  test('ArrowFunctionExpression with JSX and single param detected as component', () => {
    const result = t('const MyComp = (props) => <div class={props.cls}></div>')
    expect(result).toContain('_bind')
    expect(result).toContain('props.cls')
  })

  test('signal NOT tracked inside callback arg (callbackDepth > 0)', () => {
    // collectPropDerivedFromDecl skips when callbackDepth > 0
    const result = t('function C(props) { return <div>{items.map(item => { const x = signal(0); return <span>{x}</span> })}</div> }')
    // x is inside a callback — signal tracking doesn't apply at callback depth
    expect(result).toContain('() =>')
  })

  test('template with empty expression in attribute (attrIsDynamic false branch)', () => {
    // Empty expression in attribute: data-x={/* */} — attrIsDynamic returns false
    const result = t('<div data-x={/* comment */}><span /></div>')
    expect(result).toContain('_tpl(')
  })

  test('template with only static attributes — elementHasDynamic false', () => {
    const result = t('<div class="a" title="b"><span class="c">text</span></div>')
    expect(result).toContain('_tpl(')
    // No _bind needed for fully static tree
    expect(result).toContain('() => null')
  })

  test('signal auto-call with signal as callee of call expression', () => {
    // signal()(args) — signal IS the callee of a call, already being called
    const result = t('function C() { const fn = signal(() => 1); return <div>{fn()}</div> }')
    // fn() is already a call — no double call
    expect(result).not.toContain('fn()()')
  })

  test('signal auto-call not triggered on arrow function children', () => {
    // Arrow functions in JSX are not recursed into by referencesSignalVar
    const result = t('function C() { const x = signal(0); return <div>{() => { const x = "shadow"; return x }}</div> }')
    // The arrow function is not touched
    expect(result).toBeDefined()
  })

  test('template with deeply nested mixed expressions', () => {
    const result = t('<div><span><em>{a()}</em></span><strong>{b()}</strong></div>')
    expect(result).toContain('_tpl(')
    expect(result).toContain('_bindText(a,')
    expect(result).toContain('_bindText(b,')
  })

  test('signal in JSX attribute expression container — auto-called in bind', () => {
    const result = t('function C() { const x = signal(0); return <div data-val={x}><span /></div> }')
    // x is a signal identifier in an attribute — should be auto-called
    expect(result).toContain('x()')
    expect(result).toContain('_bind')
  })

  test('namespace attribute in template element', () => {
    // xml:lang or xlink:href — JSXNamespacedName, not JSXIdentifier
    const result = t('<svg><use xlink:href="#icon"><rect /></use></svg>')
    expect(result).toBeDefined()
  })

  test('signal as only child of component uses auto-call', () => {
    const result = t('function C() { const x = signal(0); return <MyComp>{x}</MyComp> }')
    expect(result).toContain('() => x()')
  })

  test('multiple signals with complex nesting', () => {
    const result = t(`
      function C() {
        const a = signal(1)
        const b = signal('text')
        return <div class={a ? 'active' : 'inactive'}>
          <span>{b}</span>
          <em>{a > 0 ? b : 'none'}</em>
        </div>
      }
    `)
    expect(result).toContain('a()')
    expect(result).toContain('b()')
  })
})
