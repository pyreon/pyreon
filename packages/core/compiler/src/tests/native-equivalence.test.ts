/**
 * Cross-backend equivalence tests.
 * Runs every test input through BOTH the JS and Rust implementations
 * and asserts identical output. This catches any behavioral divergence
 * between the two backends.
 */
import { transformJSX_JS } from '../jsx'

// Load native if available
let nativeTransform: ((code: string, filename: string, ssr: boolean) => {
  code: string; usesTemplates?: boolean | null; warnings: Array<{ message: string; line: number; column: number; code: string }>
}) | null = null

try {
  const path = require('node:path')
  const native = require(path.join(__dirname, '..', '..', 'native', 'pyreon-compiler.node'))
  nativeTransform = native.transformJsx
} catch {
  // Native not available — skip tests
}

const describeNative = nativeTransform ? describe : describe.skip

function compare(input: string, filename = 'test.tsx') {
  const js = transformJSX_JS(input, filename)
  const rs = nativeTransform!(input, filename, false)
  expect(rs.code).toBe(js.code)
}

function compareSsr(input: string) {
  const js = transformJSX_JS(input, 'test.tsx', { ssr: true })
  const rs = nativeTransform!(input, 'test.tsx', true)
  expect(rs.code).toBe(js.code)
}

// ─── Cross-backend equivalence ──────────────────────────────────────────────

describeNative('Native vs JS equivalence — basic', () => {
  test('simple signal child', () => compare('<div>{count()}</div>'))
  test('static string child', () => compare('<div>{"static"}</div>'))
  test('numeric child', () => compare('<div>{42}</div>'))
  test('null child', () => compare('<div>{null}</div>'))
  test('boolean true child', () => compare('<div>{true}</div>'))
  test('boolean false child', () => compare('<div>{false}</div>'))
  test('undefined child', () => compare('<div>{undefined}</div>'))
  test('arrow function child', () => compare('<div>{() => count()}</div>'))
  test('ternary with call', () => compare('<div>{a() ? b : c}</div>'))
  test('ternary without call', () => compare('<div>{a ? b : c}</div>'))
  test('logical AND with JSX', () => compare('<div>{show() && <span />}</div>'))
  test('template literal with call', () => compare('<div>{`hello ${name()}`}</div>'))
  test('template literal static', () => compare('<div>{`hello`}</div>'))
  test('tagged template', () => compare('<div>{css`color: red`}</div>'))
  test('binary with call', () => compare('<div>{count() + 1}</div>'))
  test('binary without call', () => compare('<div>{a + b}</div>'))
  test('member call', () => compare('<div>{obj.getValue()}</div>'))
  test('chained method', () => compare('<div>{items().map(x => x)}</div>'))
  test('empty expression', () => compare('<div>{/* comment */}</div>'))
  test('plain text', () => compare('<div>hello world</div>'))
  test('no JSX', () => compare('const x = 1 + 2'))
  test('empty element', () => compare('<div></div>'))
  test('self-closing', () => compare('<br />'))
})

describeNative('Native vs JS equivalence — props', () => {
  test('dynamic class', () => compare('<div class={activeClass()} />'))
  test('dynamic style', () => compare('<div style={styles()} />'))
  test('string class', () => compare('<div class="foo" />'))
  test('expression string class', () => compare('<div class={"foo"} />'))
  test('onClick handler', () => compare('<button onClick={handleClick} />'))
  test('onInput handler', () => compare('<input onInput={handler} />'))
  test('key prop', () => compare('<div key={id} />'))
  test('ref prop', () => compare('<div ref={myRef} />'))
  test('already wrapped', () => compare('<div class={() => cls()} />'))
  test('object style', () => compare('<div style={{ color: "red" }} />'))
  test('object style with call', () => compare('<div style={{ color: theme() }} />'))
  test('boolean shorthand', () => compare('<input disabled />'))
  test('data attribute', () => compare('<div data-id={getId()} />'))
  test('conditional prop', () => compare("<div title={isActive() ? 'yes' : 'no'} />"))
})

describeNative('Native vs JS equivalence — components', () => {
  test('reactive prop with _rp', () => compare('<MyComponent value={count()} />'))
  test('_rp import', () => compare('<Button label={getText()} />'))
  test('static prop', () => compare('<Button size={12} />'))
  test('event handler on component', () => compare('<Button onClick={handleClick} />'))
  test('arrow prop', () => compare('<Button render={() => "hello"} />'))
  test('children expression', () => compare('<MyComponent>{count()}</MyComponent>'))
  test('multiple reactive props', () => compare('<Comp a={x()} b={y()} c={12} />'))
  test('children prop', () => compare('<Comp children={items()} />'))
  test('spread on component', () => compare('<Comp {...getProps()} label="hi" />'))
  test('ternary in component prop', () => compare("<Comp x={a() ? 'yes' : 'no'} />"))
  test('template literal in component prop', () => compare('<Comp label={`${count()} items`} />'))
})

describeNative('Native vs JS equivalence — template emission', () => {
  test('nested elements', () => compare('<div><span>hello</span></div>'))
  test('single element with text', () => compare('<div>hello</div>'))
  test('component child bails', () => compare('<div><MyComponent /></div>'))
  test('root spread with _applyProps', () => compare('<div {...props}><span /></div>'))
  test('inner spread bails', () => compare('<div><span {...innerProps} /></div>'))
  test('keyed element bails', () => compare('<div key={id}><span /></div>'))
  test('static class in HTML', () => compare('<div class="box"><span /></div>'))
  test('boolean attr in HTML', () => compare('<div><input disabled /></div>'))
  test('_bindDirect for signal class', () => compare('<div class={cls()}><span /></div>'))
  test('_bindText for signal child', () => compare('<div><span>{name()}</span></div>'))
  test('static expression text', () => compare('<div><span>{label}</span></div>'))
  test('delegated event', () => compare('<div><button onClick={handler}>click</button></div>'))
  test('element children indexing', () => compare('<div><span>{a()}</span><em>{b()}</em></div>'))
  test('deep nesting', () => compare('<table><tbody><tr><td>{text()}</td></tr></tbody></table>'))
  test('className to class mapping', () => compare('<div className="box"><span /></div>'))
  test('htmlFor mapping', () => compare('<div><label htmlFor="name">Name</label></div>'))
  test('fragment inlining', () => compare('<div><><span>text</span></></div>'))
  test('expression with JSX bails', () => compare('<div><span />{show() && <em />}</div>'))
  test('mixed text + element + expr', () => compare('<div>hello<span />{name()}</div>'))
  test('multiple expressions', () => compare('<div><span>{a()}{b()}</span></div>'))
  test('void element', () => compare('<div><br /><span>text</span></div>'))
  test('ref in template (object)', () => compare('<div ref={myRef}><span /></div>'))
  test('ref in template (arrow)', () => compare('<div ref={(el) => { myEl = el }}><span /></div>'))
  test('non-delegated event', () => compare('<div onMouseEnter={handler}><span /></div>'))
  test('style object in template', () => compare('<div style={{ overflow: "hidden" }}>text</div>'))
  test('style string in template', () => compare('<div style="color: red">text</div>'))
  test('reactive style in template', () => compare('<div style={() => getStyle()}>text</div>'))
  test('tabindex numeric attr', () => compare('<div tabindex={0}><span /></div>'))
  test('hidden=true', () => compare('<div hidden={true}><span /></div>'))
  test('hidden=false', () => compare('<div hidden={false}><span /></div>'))
  test('hidden=null', () => compare('<div hidden={null}><span /></div>'))
  test('hidden=undefined', () => compare('<div hidden={undefined}><span /></div>'))
  test('one-time set for variable', () => compare('<div title={someVar}><span /></div>'))
  test('benchmark-like row', () => compare('<tr class={cls()}><td class="id">{String(row.id)}</td><td>{row.label()}</td></tr>'))
})

describeNative('Native vs JS equivalence — hoisting', () => {
  test('static JSX child', () => compare('<div>{<span>Hello</span>}</div>'))
  test('static self-closing', () => compare('<div>{<br />}</div>'))
  test('dynamic JSX not hoisted', () => compare('<div>{<span class={cls()}>text</span>}</div>'))
  test('static with string prop', () => compare('<div>{<span class="foo">text</span>}</div>'))
  test('multiple hoists', () => compare('<div>{<span>A</span>}{<span>B</span>}</div>'))
  test('static fragment', () => compare('<div>{<>text</>}</div>'))
  test('dynamic fragment not hoisted', () => compare('<div>{<>{count()}</>}</div>'))
  test('spread prevents hoisting', () => compare('<div>{<span {...props}>text</span>}</div>'))
  test('static boolean attr', () => compare('<div>{<input disabled />}</div>'))
  test('static true expression', () => compare('<div>{<input disabled={true} />}</div>'))
  test('static false expression', () => compare('<div>{<input disabled={false} />}</div>'))
  test('static null expression', () => compare('<div>{<input disabled={null} />}</div>'))
  test('static numeric expression', () => compare('<div>{<input tabindex={0} />}</div>'))
  test('empty expression attr', () => compare('<div>{<input disabled={/* comment */} />}</div>'))
  test('nested static element', () => compare('<div>{<div><span>text</span></div>}</div>'))
  test('nested static self-closing', () => compare('<div>{<div><br /></div>}</div>'))
  test('nested static fragment', () => compare('<div>{<div><>text</></div>}</div>'))
})

describeNative('Native vs JS equivalence — pure calls', () => {
  test('Math.max static', () => compare('<div>{Math.max(5, 10)}</div>'))
  test('JSON.stringify static', () => compare('<div>{JSON.stringify("hello")}</div>'))
  test('JSON.stringify non-static', () => compare('<div>{JSON.stringify({a: 1})}</div>'))
  test('Math.max with signal', () => compare('<div>{Math.max(count(), 10)}</div>'))
  test('unknown function', () => compare('<div>{unknownFn(5)}</div>'))
  test('Math.floor static', () => compare('<div>{Math.floor(3.14)}</div>'))
  test('Number.parseInt', () => compare('<div>{Number.parseInt("42", 10)}</div>'))
})

describeNative('Native vs JS equivalence — props detection', () => {
  test('props.x in child', () => compare('function Comp(props) { return <div>{props.name}</div> }'))
  test('props.x in attr', () => compare('function Comp(props) { return <div class={props.cls}></div> }'))
  test('prop-derived inline', () => compare('function Comp(props) { const x = props.name ?? "anon"; return <div>{x}</div> }'))
  test('prop-derived in attr', () => compare('function Comp(props) { const align = props.alignX ?? "left"; return <div class={align}></div> }'))
  test('splitProps tracking', () => compare('function Comp(props) { const [own, rest] = splitProps(props, ["x"]); const v = own.x ?? 5; return <div>{v}</div> }'))
  test('non-component not tracked', () => compare('function helper(props) { const x = props.y; return x }'))
  test('signal alongside props', () => compare('function Comp(props) { return <div>{count()}</div> }'))
  test('arrow component', () => compare('const Comp = (props) => <div>{props.x}</div>'))
  test('prop used multiple times', () => compare('function Comp(props) { const x = props.a ?? "def"; return <div class={x}>{x}</div> }'))
})

describeNative('Native vs JS equivalence — transitive derivation', () => {
  test('simple chain', () => compare('function Comp(props) { const a = props.x; const b = a + 1; return <div>{b}</div> }'))
  test('non-prop const', () => compare('function Comp(props) { const x = 42; return <div>{x}</div> }'))
  test('let not tracked', () => compare('function Comp(props) { let x = props.y; x = "override"; return <div>{x}</div> }'))
  test('deep chain', () => compare('function Comp(props) { const a = props.x; const b = a + 1; const c = b * 2; return <div>{c}</div> }'))
  test('mixed props and signals', () => compare('function Comp(props) { return <div class={`${props.base} ${count()}`}></div> }'))
})

// ─── Edge cases that previously broke ───────────────────────────────────────

describeNative('Native vs JS equivalence — TypeScript syntax', () => {
  test('as expression in prop', () => compare('function C(props) { return <div>{(props.x as string)}</div> }'))
  test('as in variable init', () => compare(`
    function C(props) {
      const items = props.data as any[]
      return <div>{items}</div>
    }
  `))
  test('non-null assertion', () => compare('function C(props) { return <div>{props.name!}</div> }'))
  test('satisfies', () => compare('function C(props) { return <div>{(props.x satisfies string)}</div> }'))
  test('type annotation on arrow', () => compare('const C = (props: { x: string }) => <div>{props.x}</div>'))
  test('generic component', () => compare('function List<T>(props: { items: T[] }) { return <div>{props.items}</div> }'))
})

describeNative('Native vs JS equivalence — export forms', () => {
  test('export default function', () => compare('export default function App(props) { return <div>{props.name}</div> }'))
  test('export const arrow', () => compare('export const App = (props) => <div>{props.name}</div>'))
  test('export named function', () => compare('export function App(props) { return <div>{props.name}</div> }'))
  test('export const with signal', () => compare('export const view = <div>{count()}</div>'))
})

describeNative('Native vs JS equivalence — control flow', () => {
  test('if statement before JSX', () => compare(`
    function C(props) {
      if (!props.show) return null
      return <div>{props.name}</div>
    }
  `))
  test('for loop before JSX', () => compare(`
    function C(props) {
      for (let i = 0; i < 10; i++) {}
      return <div>{props.name}</div>
    }
  `))
  test('try/catch wrapping JSX', () => compare(`
    function C(props) {
      try { return <div>{props.name}</div> }
      catch(e) { return <div>error</div> }
    }
  `))
  test('switch statement', () => compare(`
    function C(props) {
      switch (props.mode) {
        case 'a': return <div>A</div>
        default: return <div>B</div>
      }
    }
  `))
  test('while loop', () => compare(`
    function C() {
      let items = []
      while (items.length < 10) { items.push(1) }
      return <div>{items.length}</div>
    }
  `))
  test('ternary return', () => compare(`
    function C(props) {
      return props.show ? <div>yes</div> : <div>no</div>
    }
  `))
  test('logical AND return', () => compare(`
    function C(props) {
      return props.show && <div>yes</div>
    }
  `))
  test('arrow with block body', () => compare(`
    const C = (props) => {
      const x = props.name
      return <div>{x}</div>
    }
  `))
})

describeNative('Native vs JS equivalence — callback depth', () => {
  test('.map callback not tracked', () => compare(`
    function App(props) {
      return <div>{tabs.map((tab) => {
        const C = tab.component
        return <div><C /></div>
      })}</div>
    }
  `))
  test('.filter callback not tracked', () => compare(`
    function App(props) {
      return <div>{items.filter(i => i.visible).map(i => <span>{i.name()}</span>)}</div>
    }
  `))
  test('nested callback', () => compare(`
    function App(props) {
      return <ul>{items.map(item => (
        <li class={item.done() ? 'done' : ''}>
          <span>{item.text()}</span>
        </li>
      ))}</ul>
    }
  `))
})

describeNative('Native vs JS equivalence — children slot', () => {
  test('props.children uses _mountSlot', () => compare('function C(props) { return <div>{props.children}</div> }'))
  test('own.children uses _mountSlot', () => compare('function C(props) { const own = props; return <label><input/>{own.children}</label> }'))
  test('non-children prop uses text bind', () => compare('function C(props) { return <div>{props.name}</div> }'))
})

describeNative('Native vs JS equivalence — SSR mode', () => {
  test('SSR skips _tpl', () => {
    const code = 'function Btn() { return <button onClick={() => null}>Click {() => x()}</button> }'
    compareSsr(code)
  })
  test('SSR simple element', () => compareSsr('<div>hello</div>'))
})

describeNative('Native vs JS equivalence — warnings', () => {
  test('<For> without by produces warning', () => {
    const js = transformJSX_JS('<For each={items}>{(item) => <li>{item}</li>}</For>')
    const rs = nativeTransform!('<For each={items}>{(item) => <li>{item}</li>}</For>', 'test.tsx', false)
    expect(rs.warnings.length).toBe(js.warnings.length)
    if (js.warnings.length > 0) {
      expect(rs.warnings[0]!.code).toBe(js.warnings[0]!.code)
    }
  })
  test('<For> with by has no warning', () => {
    const js = transformJSX_JS('<For each={items} by={(i) => i.id}>{(item) => <li>{item}</li>}</For>')
    const rs = nativeTransform!('<For each={items} by={(i) => i.id}>{(item) => <li>{item}</li>}</For>', 'test.tsx', false)
    expect(rs.warnings.length).toBe(js.warnings.length)
  })
})

describeNative('Native vs JS equivalence — HTML escaping', () => {
  test('HTML entities preserved', () => compare('function C() { return <button>&lt; prev</button> }'))
  test('mixed entities and ampersands', () => compare('function C() { return <span>A &amp; B &lt; C</span> }'))
  test('quotes in attributes', () => compare('<div title="say &quot;hi&quot;"><span /></div>'))
})

describeNative('Native vs JS equivalence — signal() not inlined', () => {
  test('signal() call not tracked as prop-derived', () => compare(`
    function C(props) {
      const open = signal(props.defaultOpen ?? false)
      return <div>{() => open() ? 'yes' : 'no'}</div>
    }
  `))
})

describeNative('Native vs JS equivalence — circular references', () => {
  test('two-variable cycle does not crash', () => compare(`
    function Comp(props) {
      const a = b + props.x;
      const b = a + 1;
      return <div>{a}</div>
    }
  `))
  test('self-referencing variable', () => compare(`
    function Comp(props) {
      const a = a + props.x;
      return <div>{a}</div>
    }
  `))
  test('non-cyclic deep chain', () => compare(`
    function Comp(props) {
      const a = props.x;
      const b = a + 1;
      const c = b * 2;
      return <div>{c}</div>
    }
  `))
})

describeNative('Native vs JS equivalence — complex real-world patterns', () => {
  test('todo app component', () => compare(`
    const TodoApp = (props) => {
      const [items, rest] = splitProps(props, ['items'])
      const count = items.items?.length ?? 0
      return (
        <div class="app">
          <h1>Todos</h1>
          <footer>{count} items left</footer>
        </div>
      )
    }
  `))

  test('form with multiple props', () => compare(`
    function FormField(props) {
      const label = props.label ?? 'Field'
      const required = props.required
      return (
        <div class={required ? 'required' : ''}>
          <label>{label}</label>
          <input value={props.value} onInput={props.onInput} />
        </div>
      )
    }
  `))

  test('list with For and template rows', () => compare(`
    function UserList(props) {
      return (
        <table>
          <thead><tr><th>Name</th><th>Email</th></tr></thead>
          <tbody>
            <For each={props.users} by={(u) => u.id}>
              {(user) => (
                <tr class={user.active() ? 'active' : ''}>
                  <td>{user.name()}</td>
                  <td>{user.email()}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      )
    }
  `))

  test('conditional rendering with Show', () => compare(`
    function Modal(props) {
      return (
        <Show when={props.open}>
          <div class="overlay" onClick={props.onClose}>
            <div class="modal">
              <h2>{props.title}</h2>
              {props.children}
            </div>
          </div>
        </Show>
      )
    }
  `))
})

// ─── Unicode and multi-byte character safety ────────────────────────────────

describeNative('Native vs JS equivalence — Unicode', () => {
  test('emoji before JSX expression', () => compare(`
    function C() { return <div>🔥{count()}</div> }
  `))
  test('CJK characters before JSX', () => compare(`
    function C() { return <div>日本語{name()}</div> }
  `))
  test('accented chars in identifier', () => compare(`
    function C() { const café = "test"; return <div>{café}</div> }
  `))
  test('emoji in prop value', () => compare(`
    <div title="🎉 Party">text</div>
  `))
  test('multi-byte chars in template literal', () => compare(`
    <div>{\`Hello 世界 \${name()}\`}</div>
  `))
  test('unicode in component name', () => compare(`
    <Ñoño value={x()} />
  `))
  test('mixed unicode and ASCII', () => compare(`
    function Comp(props) {
      const naïve = props.naïve ?? "default"
      return <div class={naïve}>{props.résumé}</div>
    }
  `))
})

// ─── String literal collision resistance ────────────────────────────────────

describeNative('Native vs JS equivalence — string literal collision', () => {
  test('prop name matches string in ternary', () => compare(`
    function C(props) {
      const required = props.required
      return <div class={required ? 'required' : ''}>{required}</div>
    }
  `))
  test('prop name in template literal string part', () => compare(`
    function C(props) {
      const mode = props.mode
      return <div>{\`mode is \${mode}\`}</div>
    }
  `))
  test('prop name in object key position', () => compare(`
    function C(props) {
      const x = props.x
      return <div style={{ x: x }}></div>
    }
  `))
  test('prop name in nested string', () => compare(`
    function C(props) {
      const label = props.label
      return <div title={label || "label"}>text</div>
    }
  `))
})

// ─── Additional robustness tests ────────────────────────────────────────────

describeNative('Native vs JS equivalence — additional edge cases', () => {
  test('deeply nested template', () => compare(`
    <div><section><article><header><h1>{title()}</h1></header><p>{body()}</p></article></section></div>
  `))
  test('multiple components in one file', () => compare(`
    function A(props) { return <div>{props.a}</div> }
    function B(props) { return <span>{props.b}</span> }
  `))
  test('component returning fragment', () => compare(`
    function C(props) { return <>{props.children}</> }
  `))
  test('empty component', () => compare(`
    function C() { return <div></div> }
  `))
  test('template inside fragment wraps in braces', () => compare(`
    function C() { return <><button type="button">text</button><span /></> }
  `))
  test('template inside nested fragment', () => compare(`
    function C() { return <><><div>inner</div></></> }
  `))
  test('template in JSX attribute value (not brace-wrapped)', () => compare(`
    <Show fallback={<div><p>Not logged in</p></div>}><span /></Show>
  `))
  test('full Showcase pattern with Show + fallback', () => compare(`
    function Demo(props) {
      const open = signal(false)
      return (
        <Show
          when={() => open()}
          fallback={<div class="demo"><p>Fallback</p><button type="button">Action</button></div>}
        >
          <div><p>Content</p></div>
        </Show>
      )
    }
  `))
  test('array destructuring from signal', () => compare(`
    function C(props) {
      const [a, b] = props.items
      return <div>{a}</div>
    }
  `))
  test('nested function not confused with component', () => compare(`
    function App(props) {
      function helper() { return props.x + 1 }
      return <div>{helper()}</div>
    }
  `))
  test('class with JSX method', () => compare(`
    class C { render(props) { return <div>{props.name}</div> } }
  `))
  test('immediately invoked arrow', () => compare(`
    const el = (() => <div>{count()}</div>)()
  `))
  test('JSX in variable init', () => compare(`
    const header = <header><h1>Title</h1></header>
  `))
  test('multiple JSX returns', () => compare(`
    function C(props) {
      if (props.loading) return <div>Loading...</div>
      if (props.error) return <div>Error</div>
      return <div>{props.data}</div>
    }
  `))
})
