/**
 * Cross-backend equivalence tests.
 * Runs every test input through BOTH the JS and Rust implementations
 * and asserts identical output. This catches any behavioral divergence
 * between the two backends.
 */
import { rocketstyleCollapseKey, transformJSX_JS } from '../jsx'
import type { ReactivitySpan } from '../jsx'

// Load native if available
let nativeTransform:
  | ((
      code: string,
      filename: string,
      ssr: boolean,
      knownSignals: string[] | null,
      reactivityLens?: boolean,
    ) => {
      code: string
      usesTemplates?: boolean | null
      warnings: Array<{ message: string; line: number; column: number; code: string }>
      reactivityLens?: ReactivitySpan[] | null
    })
  | null = null

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
  const rs = nativeTransform!(input, filename, false, null)
  expect(rs.code).toBe(js.code)
}

function compareWithSignals(input: string, knownSignals: string[]) {
  const js = transformJSX_JS(input, 'test.tsx', { knownSignals })
  const rs = nativeTransform!(input, 'test.tsx', false, knownSignals)
  expect(rs.code).toBe(js.code)
}

function compareSsr(input: string) {
  const js = transformJSX_JS(input, 'test.tsx', { ssr: true })
  const rs = nativeTransform!(input, 'test.tsx', true, null)
  expect(rs.code).toBe(js.code)
}

// Reactivity-lens cross-backend gate (Phase 3). Asserts the Rust binary
// emits the SAME sidecar the JS oracle does. Two contracts:
//   1. ADDITIVE — `code` is byte-identical with the lens collected vs
//      not, on BOTH backends (the option never affects codegen).
//   2. PARITY — the SET of recorded spans is identical JS↔Rust.
// Spans are compared order-independently: the LSP consumer sorts before
// rendering, so traversal order is NOT part of the contract — the SET of
// codegen decisions is. Sorting by (start,end,kind,detail) makes a
// missing/extra/wrong span fail loudly while ignoring walk order.
function canon(spans: ReactivitySpan[] | null | undefined): string[] {
  return (spans ?? [])
    .map(
      (s) =>
        `${s.start}|${s.end}|${s.line}|${s.column}|${s.endLine}|${s.endColumn}|${s.kind}|${s.detail}`,
    )
    .sort()
}

function compareLens(input: string, filename = 'test.tsx') {
  const jsOff = transformJSX_JS(input, filename)
  const jsOn = transformJSX_JS(input, filename, { reactivityLens: true })
  const rsOff = nativeTransform!(input, filename, false, null, false)
  const rsOn = nativeTransform!(input, filename, false, null, true)

  // (1) additive — collecting the lens never changes emitted code, on
  // either backend, and both backends still agree on that code.
  expect(jsOn.code).toBe(jsOff.code)
  expect(rsOn.code).toBe(rsOff.code)
  expect(rsOn.code).toBe(jsOn.code)

  // The opt-out path must NOT carry the sidecar (parity with JS, which
  // omits the field entirely when not collecting).
  expect(rsOff.reactivityLens == null).toBe(true)
  expect(jsOff.reactivityLens == null).toBe(true)

  // (2) parity — identical SET of spans.
  const j = canon(jsOn.reactivityLens)
  const r = canon(rsOn.reactivityLens)
  expect(r).toEqual(j)
  // Guard against the degenerate "both empty → trivially equal" pass:
  // every fixture below is chosen to produce ≥1 span.
  expect(j.length).toBeGreaterThan(0)
}

// ─── Cross-backend equivalence ──────────────────────────────────────────────

describeNative('Native vs JS equivalence — class/style binding fidelity', () => {
  const sig = `import { signal } from '@pyreon/reactivity'\nconst c = signal(0); const a = signal(true); const t = signal('x')\n`
  // class — cx-normalizing form (array/object → cx, string passthrough)
  test('class array', () => compare(`${sig}export const X = () => <div class={[t(), 'x']}>y</div>`))
  test('class object', () => compare(`${sig}export const X = () => <div class={{ active: a() }}>y</div>`))
  test('class string ternary', () => compare(`${sig}export const X = () => <div class={c() > 10 ? 'hot' : 'cold'}>y</div>`))
  test('class non-reactive', () => compare(`export const X = () => <div class={someVar}>y</div>`))
  test('class direct signal ref', () => compare(`${sig}export const X = () => <div class={t}>y</div>`))
  // style — object-aware form (object → Object.assign, string → cssText)
  test('style object literal (reactive)', () => compare(`${sig}export const X = () => <div style={{ color: t() }}>y</div>`))
  test('style object thunk (reactive)', () => compare(`${sig}export const X = () => <div style={() => ({ color: t() })}>y</div>`))
  test('style string template', () => compare(`${sig}export const X = () => <div style={\`color: \${t()}\`}>y</div>`))
  test('style static object (one-shot)', () => compare(`export const X = () => <div style={{ color: 'red' }}>y</div>`))
})

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

  // Regression: a child element with a block-arrow ref AND adjacent
  // reactive props used to emit `const __e0 = __root.children[N]`
  // followed by `((el) => { ... })(__e0)` with NO `;` between, so JS's
  // ASI merged them into one expression `const __e0 = X((el) => ...)(__e0)`
  // (calling X as fn, self-referencing __e0). Both backends now append
  // `;` to every bind line. This test asserts both emit the SAME `;`-
  // terminated output and the chained-call shape never appears.
  test('block-arrow ref on child element with adjacent reactive prop', () => {
    const input = '<div><span ref={(el) => { x = el }} data-state={cls()} /></div>'
    compare(input)
    // Tighter assertion: neither backend may emit the silent-merge shape.
    const js = transformJSX_JS(input, 'test.tsx')
    expect(js.code).not.toMatch(/firstElementChild\(\(/)
    expect(js.code).toMatch(/const __e0 = __root\.firstElementChild;/)
    const rs = nativeTransform!(input, 'test.tsx', false, null)
    expect(rs.code).not.toMatch(/firstElementChild\(\(/)
    expect(rs.code).toMatch(/const __e0 = __root\.firstElementChild;/)
  })
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
  test('benchmark-like row', () =>
    compare('<tr class={cls()}><td class="id">{String(row.id)}</td><td>{row.label()}</td></tr>'))
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
  test('props.x in attr', () =>
    compare('function Comp(props) { return <div class={props.cls}></div> }'))
  test('prop-derived inline', () =>
    compare('function Comp(props) { const x = props.name ?? "anon"; return <div>{x}</div> }'))
  test('prop-derived in attr', () =>
    compare(
      'function Comp(props) { const align = props.alignX ?? "left"; return <div class={align}></div> }',
    ))
  test('splitProps tracking', () =>
    compare(
      'function Comp(props) { const [own, rest] = splitProps(props, ["x"]); const v = own.x ?? 5; return <div>{v}</div> }',
    ))
  test('non-component not tracked', () =>
    compare('function helper(props) { const x = props.y; return x }'))
  test('signal alongside props', () =>
    compare('function Comp(props) { return <div>{count()}</div> }'))
  test('arrow component', () => compare('const Comp = (props) => <div>{props.x}</div>'))
  test('prop used multiple times', () =>
    compare('function Comp(props) { const x = props.a ?? "def"; return <div class={x}>{x}</div> }'))
})

describeNative('Native vs JS equivalence — transitive derivation', () => {
  test('simple chain', () =>
    compare('function Comp(props) { const a = props.x; const b = a + 1; return <div>{b}</div> }'))
  test('non-prop const', () =>
    compare('function Comp(props) { const x = 42; return <div>{x}</div> }'))
  test('let not tracked', () =>
    compare('function Comp(props) { let x = props.y; x = "override"; return <div>{x}</div> }'))
  test('deep chain', () =>
    compare(
      'function Comp(props) { const a = props.x; const b = a + 1; const c = b * 2; return <div>{c}</div> }',
    ))
  test('mixed props and signals', () =>
    compare('function Comp(props) { return <div class={`${props.base} ${count()}`}></div> }'))
})

// ─── Edge cases that previously broke ───────────────────────────────────────

describeNative('Native vs JS equivalence — TypeScript syntax', () => {
  test('as expression in prop', () =>
    compare('function C(props) { return <div>{(props.x as string)}</div> }'))
  test('as in variable init', () =>
    compare(`
    function C(props) {
      const items = props.data as any[]
      return <div>{items}</div>
    }
  `))
  test('non-null assertion', () => compare('function C(props) { return <div>{props.name!}</div> }'))
  test('satisfies', () =>
    compare('function C(props) { return <div>{(props.x satisfies string)}</div> }'))
  test('type annotation on arrow', () =>
    compare('const C = (props: { x: string }) => <div>{props.x}</div>'))
  test('generic component', () =>
    compare('function List<T>(props: { items: T[] }) { return <div>{props.items}</div> }'))
})

describeNative('Native vs JS equivalence — export forms', () => {
  test('export default function', () =>
    compare('export default function App(props) { return <div>{props.name}</div> }'))
  test('export const arrow', () => compare('export const App = (props) => <div>{props.name}</div>'))
  test('export named function', () =>
    compare('export function App(props) { return <div>{props.name}</div> }'))
  test('export const with signal', () => compare('export const view = <div>{count()}</div>'))
})

describeNative('Native vs JS equivalence — control flow', () => {
  test('if statement before JSX', () =>
    compare(`
    function C(props) {
      if (!props.show) return null
      return <div>{props.name}</div>
    }
  `))
  test('for loop before JSX', () =>
    compare(`
    function C(props) {
      for (let i = 0; i < 10; i++) {}
      return <div>{props.name}</div>
    }
  `))
  test('try/catch wrapping JSX', () =>
    compare(`
    function C(props) {
      try { return <div>{props.name}</div> }
      catch(e) { return <div>error</div> }
    }
  `))
  test('switch statement', () =>
    compare(`
    function C(props) {
      switch (props.mode) {
        case 'a': return <div>A</div>
        default: return <div>B</div>
      }
    }
  `))
  test('while loop', () =>
    compare(`
    function C() {
      let items = []
      while (items.length < 10) { items.push(1) }
      return <div>{items.length}</div>
    }
  `))
  test('ternary return', () =>
    compare(`
    function C(props) {
      return props.show ? <div>yes</div> : <div>no</div>
    }
  `))
  test('logical AND return', () =>
    compare(`
    function C(props) {
      return props.show && <div>yes</div>
    }
  `))
  test('arrow with block body', () =>
    compare(`
    const C = (props) => {
      const x = props.name
      return <div>{x}</div>
    }
  `))
})

describeNative('Native vs JS equivalence — callback depth', () => {
  test('.map callback not tracked', () =>
    compare(`
    function App(props) {
      return <div>{tabs.map((tab) => {
        const C = tab.component
        return <div><C /></div>
      })}</div>
    }
  `))
  test('.filter callback not tracked', () =>
    compare(`
    function App(props) {
      return <div>{items.filter(i => i.visible).map(i => <span>{i.name()}</span>)}</div>
    }
  `))
  test('nested callback', () =>
    compare(`
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
  test('props.children uses _mountSlot', () =>
    compare('function C(props) { return <div>{props.children}</div> }'))
  test('own.children uses _mountSlot', () =>
    compare(
      'function C(props) { const own = props; return <label><input/>{own.children}</label> }',
    ))
  test('non-children prop uses text bind', () =>
    compare('function C(props) { return <div>{props.name}</div> }'))
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
    const rs = nativeTransform!(
      '<For each={items}>{(item) => <li>{item}</li>}</For>',
      'test.tsx',
      false,
      null,
    )
    expect(rs.warnings.length).toBe(js.warnings.length)
    if (js.warnings.length > 0) {
      expect(rs.warnings[0]!.code).toBe(js.warnings[0]!.code)
    }
  })
  test('<For> with by has no warning', () => {
    const js = transformJSX_JS(
      '<For each={items} by={(i) => i.id}>{(item) => <li>{item}</li>}</For>',
    )
    const rs = nativeTransform!(
      '<For each={items} by={(i) => i.id}>{(item) => <li>{item}</li>}</For>',
      'test.tsx',
      false,
      null,
    )
    expect(rs.warnings.length).toBe(js.warnings.length)
  })
})

describeNative('Native vs JS equivalence — HTML escaping', () => {
  test('HTML entities preserved', () =>
    compare('function C() { return <button>&lt; prev</button> }'))
  test('mixed entities and ampersands', () =>
    compare('function C() { return <span>A &amp; B &lt; C</span> }'))
  test('quotes in attributes', () => compare('<div title="say &quot;hi&quot;"><span /></div>'))
})

describeNative('Native vs JS equivalence — signal() not inlined', () => {
  test('signal() call not tracked as prop-derived', () =>
    compare(`
    function C(props) {
      const open = signal(props.defaultOpen ?? false)
      return <div>{() => open() ? 'yes' : 'no'}</div>
    }
  `))
})

describeNative('Native vs JS equivalence — circular references', () => {
  test('two-variable cycle does not crash', () =>
    compare(`
    function Comp(props) {
      const a = b + props.x;
      const b = a + 1;
      return <div>{a}</div>
    }
  `))
  test('self-referencing variable', () =>
    compare(`
    function Comp(props) {
      const a = a + props.x;
      return <div>{a}</div>
    }
  `))
  test('non-cyclic deep chain', () =>
    compare(`
    function Comp(props) {
      const a = props.x;
      const b = a + 1;
      const c = b * 2;
      return <div>{c}</div>
    }
  `))
})

describeNative('Native vs JS equivalence — complex real-world patterns', () => {
  test('todo app component', () =>
    compare(`
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

  test('form with multiple props', () =>
    compare(`
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

  test('list with For and template rows', () =>
    compare(`
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

  test('conditional rendering with Show', () =>
    compare(`
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
  test('emoji before JSX expression', () =>
    compare(`
    function C() { return <div>🔥{count()}</div> }
  `))
  test('CJK characters before JSX', () =>
    compare(`
    function C() { return <div>日本語{name()}</div> }
  `))
  test('accented chars in identifier', () =>
    compare(`
    function C() { const café = "test"; return <div>{café}</div> }
  `))
  test('emoji in prop value', () =>
    compare(`
    <div title="🎉 Party">text</div>
  `))
  test('multi-byte chars in template literal', () =>
    compare(`
    <div>{\`Hello 世界 \${name()}\`}</div>
  `))
  test('unicode in component name', () =>
    compare(`
    <Ñoño value={x()} />
  `))
  test('mixed unicode and ASCII', () =>
    compare(`
    function Comp(props) {
      const naïve = props.naïve ?? "default"
      return <div class={naïve}>{props.résumé}</div>
    }
  `))
})

// ─── String literal collision resistance ────────────────────────────────────

describeNative('Native vs JS equivalence — string literal collision', () => {
  test('prop name matches string in ternary', () =>
    compare(`
    function C(props) {
      const required = props.required
      return <div class={required ? 'required' : ''}>{required}</div>
    }
  `))
  test('prop name in template literal string part', () =>
    compare(`
    function C(props) {
      const mode = props.mode
      return <div>{\`mode is \${mode}\`}</div>
    }
  `))
  test('prop name in object key position', () =>
    compare(`
    function C(props) {
      const x = props.x
      return <div style={{ x: x }}></div>
    }
  `))
  test('prop name in nested string', () =>
    compare(`
    function C(props) {
      const label = props.label
      return <div title={label || "label"}>text</div>
    }
  `))
})

// ─── Additional robustness tests ────────────────────────────────────────────

describeNative('Native vs JS equivalence — additional edge cases', () => {
  test('deeply nested template', () =>
    compare(`
    <div><section><article><header><h1>{title()}</h1></header><p>{body()}</p></article></section></div>
  `))
  test('multiple components in one file', () =>
    compare(`
    function A(props) { return <div>{props.a}</div> }
    function B(props) { return <span>{props.b}</span> }
  `))
  test('component returning fragment', () =>
    compare(`
    function C(props) { return <>{props.children}</> }
  `))
  test('empty component', () =>
    compare(`
    function C() { return <div></div> }
  `))
  test('template inside fragment wraps in braces', () =>
    compare(`
    function C() { return <><button type="button">text</button><span /></> }
  `))
  test('template inside nested fragment', () =>
    compare(`
    function C() { return <><><div>inner</div></></> }
  `))
  test('template in JSX attribute value (not brace-wrapped)', () =>
    compare(`
    <Show fallback={<div><p>Not logged in</p></div>}><span /></Show>
  `))
  test('full Showcase pattern with Show + fallback', () =>
    compare(`
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
  test('array destructuring from signal', () =>
    compare(`
    function C(props) {
      const [a, b] = props.items
      return <div>{a}</div>
    }
  `))
  test('nested function not confused with component', () =>
    compare(`
    function App(props) {
      function helper() { return props.x + 1 }
      return <div>{helper()}</div>
    }
  `))
  test('class with JSX method', () =>
    compare(`
    class C { render(props) { return <div>{props.name}</div> } }
  `))
  test('immediately invoked arrow', () =>
    compare(`
    const el = (() => <div>{count()}</div>)()
  `))
  test('JSX in variable init', () =>
    compare(`
    const header = <header><h1>Title</h1></header>
  `))
  test('multiple JSX returns', () =>
    compare(`
    function C(props) {
      if (props.loading) return <div>Loading...</div>
      if (props.error) return <div>Error</div>
      return <div>{props.data}</div>
    }
  `))
})

// ─── Signal auto-call cross-backend equivalence ─────────────────────────────

describeNative('Native vs JS equivalence — signal auto-call', () => {
  test('bare signal in text child', () =>
    compare('function C() { const name = signal("Vít"); return <div>{name}</div> }'))
  test('signal in attribute', () =>
    compare(
      'function C() { const show = signal(false); return <div class={show ? "active" : ""}></div> }',
    ))
  test('already called NOT double-called', () =>
    compare('function C() { const count = signal(0); return <div>{count()}</div> }'))
  test('computed auto-called', () =>
    compare('function C() { const d = computed(() => 2); return <div>{d}</div> }'))
  test('signal in ternary', () =>
    compare('function C() { const show = signal(false); return <div>{show ? "yes" : "no"}</div> }'))
  test('signal in template literal', () =>
    compare('function C() { const name = signal("world"); return <div>{`hello ${name}`}</div> }'))
  test('signal in component prop with _rp', () =>
    compare('function C() { const val = signal(42); return <MyComp value={val} /> }'))
  test('multiple signals', () =>
    compare('function C() { const a = signal(1); const b = signal(2); return <div>{a + b}</div> }'))
  test('signal + computed together', () =>
    compare(
      'function C() { const count = signal(0); const doubled = computed(() => count() * 2); return <div>{count} + {doubled}</div> }',
    ))
  test('non-signal const NOT auto-called', () =>
    compare('function C() { const x = 42; return <div>{x}</div> }'))
  test('shorthand property NOT auto-called', () =>
    compare('function C() { const name = signal("x"); return <div>{t("hi", { name })}</div> }'))
  test('non-shorthand property value auto-called', () =>
    compare(
      'function C() { const name = signal("x"); return <div>{t("hi", { label: name })}</div> }',
    ))
  test('signal in object property value', () =>
    compare('function C() { const x = signal(0); return <div>{({val: x})}</div> }'))
  test('signal as member expression object', () =>
    compare('function C() { const x = signal(0); return <div>{x.toString()}</div> }'))
  test('signal in computed property access', () =>
    compare('function C() { const idx = signal(0); return <div>{arr[idx]}</div> }'))
  test('shadowed by inner const', () =>
    compare(`
    const show = signal(false)
    function Inner() {
      const show = 'not a signal'
      return <div>{show}</div>
    }
  `))
  test('shadowed by function parameter', () =>
    compare(`
    const count = signal(0)
    function Display(count) {
      return <div>{count}</div>
    }
  `))
  test('shadowed by destructured parameter', () =>
    compare(`
    const name = signal('Vít')
    function Greet({ name }) {
      return <div>{name}</div>
    }
  `))
  test('export default function with shadow', () =>
    compare(`
    const show = signal(false)
    export default function App(show) {
      return <div>{show}</div>
    }
  `))
  test('export named function with shadow', () =>
    compare(`
    const show = signal(false)
    export function App(show) {
      return <div>{show}</div>
    }
  `))
  test('module-scope signal auto-called', () =>
    compare('const globalSig = signal(0); function C() { return <div>{globalSig}</div> }'))
  test('props + signal in same expression', () =>
    compare(
      'function C(props) { const show = signal(false); const label = props.label; return <div class={show ? label : "default"}></div> }',
    ))
})

describeNative('Native vs JS equivalence — knownSignals cross-module', () => {
  test('imported signal auto-called', () =>
    compareWithSignals(
      'import { count } from "./store"; function App() { return <div>{count}</div> }',
      ['count'],
    ))
  test('imported signal with alias', () =>
    compareWithSignals(
      'import { count as c } from "./store"; function App() { return <div>{c}</div> }',
      ['c'],
    ))
  test('imported signal not double-called', () =>
    compareWithSignals(
      'import { count } from "./store"; function App() { return <div>{count()}</div> }',
      ['count'],
    ))
  test('imported signal respects shadow', () =>
    compareWithSignals(
      'import { count } from "./store"; function App() { const count = "shadow"; return <div>{count}</div> }',
      ['count'],
    ))
  test('knownSignals combined with local signals', () =>
    compareWithSignals(
      'import { theme } from "./store"; function App() { const count = signal(0); return <div class={theme}>{count}</div> }',
      ['theme'],
    ))
})

// PR #352 added a `DOM_PROPS` set so `<input value={x()} />` inside a
// template-emitting context compiles to `el.value = x()` (property
// assignment) instead of `el.setAttribute("value", x())` (content
// attribute). The two diverge for IDL properties whose live state
// differs from the content attribute (`value`, `checked`, etc.). The
// Rust native backend reimplements this list separately. A typo in
// either side's list would silently produce wrong output for one
// DOM_PROP without breaking any other test. This block enumerates
// every DOM_PROP under template context (the only context where
// DOM_PROPS actually fires — root-level standalone JSX uses the
// `h()` path, not `_tpl() + _bind()`) and asserts JS↔Rust agreement,
// so a drift between the two lists fails one specific test.
//
// Reference: packages/core/compiler/src/jsx.ts:1389 — DOM_PROPS Set.
describeNative('Native vs JS equivalence — DOM properties', () => {
  const DOM_PROPS = [
    'value',
    'checked',
    'selected',
    'disabled',
    'multiple',
    'readOnly',
    'indeterminate',
  ] as const

  for (const prop of DOM_PROPS) {
    test(`DOM_PROP in template: <div><input ${prop}={x()} /></div> (reactive)`, () => {
      compare(`<div><input ${prop}={x()} /></div>`)
    })

    test(`DOM_PROP in template: <div><input ${prop}={() => x()} /></div> (accessor)`, () => {
      compare(`<div><input ${prop}={() => x()} /></div>`)
    })

    test(`DOM_PROP in template: <div><input ${prop}={true} /></div> (literal)`, () => {
      compare(`<div><input ${prop}={true} /></div>`)
    })
  }

  test('regression: all DOM_PROPS together in one template', () => {
    // Sentinel — if a future PR adds a new DOM property to either
    // backend without adding it to the other, the loop above won't
    // notice unless that prop is in the test list. This single test
    // compiles JSX with ALL known DOM_PROPS together and verifies
    // both backends agree on the combined output.
    const allProps = DOM_PROPS.map((p) => `${p}={x()}`).join(' ')
    compare(`<div><input ${allProps} /></div>`)
  })

  test('non-DOM-prop control: title in template uses setAttribute, not assignment', () => {
    // Negative control — `title` is NOT a DOM_PROP, so it should
    // compile through setAttribute. If this test starts failing,
    // someone added `title` to DOM_PROPS — verify intent before
    // updating.
    compare('<div><input title={x()} /></div>')
  })
})

// ─── Reactivity-lens parity (Phase 3) ───────────────────────────────────────
// The Rust binary must emit the SAME sidecar as the JS oracle so the
// ~80% of users on the native path get the Lens too. Each fixture is
// chosen to exercise one of the five structural kinds; `compareLens`
// also asserts the additive guarantee (codegen byte-identical with the
// option on vs off, both backends) so this block doubles as the native
// regression guard for "the lens option must never affect output".
//
// Bisect-verified: removing ANY of the 6 `ctx.lens(...)` calls in
// native/src/lib.rs fails the matching fixture below with an
// array-length / element mismatch in `compareLens`'s parity assertion
// (e.g. dropping the `reactive-prop` call → `<Comp value={x()} />` fails
// `expect(r).toEqual(j)` because the Rust set is missing that span);
// restored → 9/9 pass.
describeNative('Reactivity-lens — JS↔Rust span parity', () => {
  test('reactive text child (_bindText)', () => compareLens('<div>{count()}</div>'))

  test('reactive accessor text child (() => …)', () => compareLens('<div>{() => count()}</div>'))

  test('static-text child (baked once — the high-precision negative)', () =>
    compareLens('<div>{someConst}</div>'))

  test('reactive-prop on a component (_rp(() => …))', () => compareLens('<Comp value={count()} />'))

  test('reactive-attr on a DOM element (live binding)', () =>
    compareLens('<div><span title={count()}>hi</span></div>'))

  test('hoisted-static (module-scope hoist)', () =>
    compareLens('<Comp>{<b class="x">hi</b>}</Comp>'))

  test('mixed: reactive + static + prop in one tree', () =>
    compareLens('<section><Comp value={count()} /><p>{count()}</p><p>{label}</p></section>'))

  test('multi-line source — line/column parity across newlines', () =>
    compareLens('<div>\n  {count()}\n  <span title={other()}>\n  z</span>\n</div>'))

  test('signal auto-call shape — declared signal, bare {count} → reactive', () =>
    compareLens('const count = signal(0); const App = () => <div>{count}</div>', 'auto.tsx'))
})

describeNative('cross-backend: component-child stable-reference carve-out', () => {
  test('bare Identifier (splitProps-derived const) emitted bare in component child', () =>
    compare(`
      const Kinetic = (props) => {
        const [childHolder, restHtml] = splitProps(props, ['children'])
        const children = childHolder.children
        return <StaggerRenderer htmlProps={restHtml}>{children}</StaggerRenderer>
      }
    `))

  test('simple MemberExpression chain emitted bare in component child', () =>
    compare(`
      const Comp = (props) => {
        const [obj] = splitProps(props, ['deep'])
        return <Inner>{obj.deep.x}</Inner>
      }
    `))

  test('CallExpression keeps the wrap in component child', () =>
    compare(`
      const count = signal(0)
      const Comp = () => <Inner>{count()}</Inner>
    `))

  test('BinaryExpression keeps the wrap in component child', () =>
    compare(`
      const Comp = (props) => {
        const [own] = splitProps(props, ['a', 'b'])
        return <Inner>{own.a + own.b}</Inner>
      }
    `))

  test('DOM-element parent keeps reactive binding (no carve-out)', () =>
    compare(`
      const Comp = (props) => {
        const [own] = splitProps(props, ['children'])
        const children = own.children
        return <div>{children}</div>
      }
    `))

  test('user-written accessor child passes through unchanged', () =>
    compare(`
      const x = signal('a')
      const Comp = () => <Inner>{() => x()}</Inner>
    `))

  test('bare signal identifier in component child — KEEPS wrap (auto-call + reactivity)', () =>
    compare(`
      function C() {
        const count = signal(0)
        return <MyComp>{count}</MyComp>
      }
    `))

  test('TS-cast wrapper (`children as VNode[]`) is transparent — both backends', () =>
    compare(`
      const Kinetic = (props) => {
        const [childHolder] = splitProps(props, ['children'])
        const children = childHolder.children
        return <Inner>{children as VNode[]}</Inner>
      }
    `))

  test('non-null `!` postfix is transparent — both backends', () =>
    compare(`
      const Comp = (props) => {
        const [own] = splitProps(props, ['children'])
        return <Inner>{own.children!}</Inner>
      }
    `))

  test('fragment child of component does NOT propagate component context', () =>
    compare(`
      const Comp = (props) => {
        const [own] = splitProps(props, ['children'])
        const children = own.children
        return <Inner><>{children}</></Inner>
      }
    `))

  test('static-array children (rest-args form, no expression container) — unchanged', () =>
    compare(`
      const Comp = (props) => (
        <Inner>
          <A />
          <B />
        </Inner>
      )
    `))
})

// ----------------------------------------------------------------------
// Selector-ternary auto-promotion: `selector(k) ? a : b` in className/attr
// bindings compiles to `selector.subscribe(k, m => ...)` — the effect-free
// per-key fast path. Both backends must emit byte-identical output for
// every shape in the bail catalog.
// ----------------------------------------------------------------------

describeNative('Native vs JS equivalence — selector.subscribe auto-promotion', () => {
  test('promotes `class={() => sel(id) ? "a" : "b"}` shape', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const selected = signal(null)
      const isSel = createSelector(selected)
      export const Row = (row) => (
        <tr class={() => isSel(row.id) ? 'selected' : ''}>
          <td>{row.id}</td>
        </tr>
      )
    `))

  test('promotes bare `class={sel(k) ? a : b}` (no arrow)', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const selected = signal(null)
      const isSel = createSelector(selected)
      export const X = (k) => <div class={isSel(k) ? 'on' : 'off'}>x</div>
    `))

  test('promotes for setAttribute-style attrs (aria-current)', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const sel = createSelector(signal(null))
      export const X = (k) => <a aria-current={() => sel(k) ? 'page' : 'false'}>x</a>
    `))

  test('preserves deep key expression literally (item.deep.path.id)', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const sel = createSelector(signal(null))
      export const X = (item) => <div class={() => sel(item.deep.path.id) ? 'a' : 'b'}>x</div>
    `))

  test('bails when selector identifier is NOT createSelector result', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const someFn = (k) => k === 1
      export const X = (k) => <div class={() => someFn(k) ? 'a' : 'b'}>x</div>
    `))

  test('bails when key argument contains a signal call', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const selected = signal(null)
      const id = signal(0)
      const isSel = createSelector(selected)
      export const X = () => <div class={() => isSel(id()) ? 'a' : 'b'}>x</div>
    `))

  test('bails when a branch contains a signal call', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const selected = signal(null)
      const cls = signal('default')
      const isSel = createSelector(selected)
      export const X = (k) => <div class={() => isSel(k) ? cls() : 'b'}>x</div>
    `))

  test('bails when call has 2 args (not the standard shape)', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const selected = signal(null)
      const isSel = createSelector(selected)
      export const X = (k, extra) => <div class={() => isSel(k, extra) ? 'a' : 'b'}>x</div>
    `))

  test('bails when expression is NOT a ternary (plain call)', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const selected = signal(null)
      const isSel = createSelector(selected)
      export const X = (k) => <div class={() => isSel(k)}>x</div>
    `))
})

// ----------------------------------------------------------------------
// Text-child selector ternary auto-promotion (companion to className PR
// #898 — same detector, different emission target).
// ----------------------------------------------------------------------

describeNative('Native vs JS equivalence — text-child selector.subscribe auto-promotion', () => {
  test('promotes `<td>{() => sel(k) ? "X" : ""}</td>` shape', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const selected = signal(null)
      const isSelected = createSelector(selected)
      export const Row = (row) => <td>{() => isSelected(row.id) ? '✓' : ''}</td>
    `))

  test('preserves deep key (item.deep.id)', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const sel = createSelector(signal(null))
      export const X = (item) => <span>{() => sel(item.deep.id) ? 'A' : 'B'}</span>
    `))

  test('bails when selector ID NOT createSelector result', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const fn = (k) => k === 1
      export const X = (k) => <span>{() => fn(k) ? 'A' : 'B'}</span>
    `))

  test('bails when branch contains a signal call', () =>
    compare(`
      import { createSelector, signal } from '@pyreon/reactivity'
      const cls = signal('x')
      const isSel = createSelector(signal(null))
      export const X = (k) => <span>{() => isSel(k) ? cls() : 'b'}</span>
    `))
})

// ----------------------------------------------------------------------
// Signal-method-call auto-promotion to `_bindDirect`.
// ----------------------------------------------------------------------

describeNative('Native vs JS equivalence — signal-method-call auto-promotion', () => {
  test('Number.toFixed(2)', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const count = signal(0)
      export const X = () => <span>{count().toFixed(2)}</span>
    `))

  test('String.toUpperCase()', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const name = signal('a')
      export const X = () => <span>{name().toUpperCase()}</span>
    `))

  test('String.slice(0, 5)', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const s = signal('hello world')
      export const X = () => <span>{s().slice(0, 5)}</span>
    `))

  test('String.padStart(4, "0")', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const n = signal('1')
      export const X = () => <span>{n().padStart(4, "0")}</span>
    `))

  test('toString(16) (radix arg)', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const n = signal(255)
      export const X = () => <span>{n().toString(16)}</span>
    `))

  test('bails on non-safelist method (Array.sort)', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const arr = signal([1, 2, 3])
      export const X = () => <span>{arr().sort()}</span>
    `))

  test('bails when method args contain a signal call', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const s = signal('hello')
      const n = signal(0)
      export const X = () => <span>{s().slice(n())}</span>
    `))

  test('bails when receiver is not a known signal', () =>
    compare(`
      const v = 42
      export const X = () => <span>{v.toFixed(2)}</span>
    `))

  test('bails when method callee is computed (sig()["toFixed"](2))', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const c = signal(0)
      export const X = () => <span>{c()["toFixed"](2)}</span>
    `))
})

describeNative('Native vs JS equivalence — HTML text entity escaping', () => {
  // The `&` in static text is escaped to `&amp;` UNLESS it forms a valid
  // char-ref: `#<dec>`, `#x<hex>`, or `<letter><word*>`. Both backends MUST
  // agree. Regression for the `&<digits>;` divergence (Rust wrongly accepted a
  // bare numeric run without `#`).
  test('bare numeric entity without # is escaped', () => compare('export const X = () => <div>a&123;b</div>'))
  test('digit-led mixed run is escaped', () => compare('export const X = () => <div>a&123abc;b</div>'))
  test('valid named entity is preserved', () => compare('export const X = () => <div>a&amp;b</div>'))
  test('letter-led entity-ish run is preserved', () => compare('export const X = () => <div>a&xyz;b</div>'))
  test('valid decimal char-ref is preserved', () => compare('export const X = () => <div>a&#65;b</div>'))
  test('valid lowercase-x hex char-ref is preserved', () => compare('export const X = () => <div>a&#x1F;b</div>'))
  test('uppercase #X hex is NOT a valid ref (matches JS regex)', () => compare('export const X = () => <div>a&#X41;b</div>'))
  test('bare ampersand with spaces is escaped', () => compare('export const X = () => <div>tom & jerry</div>'))
  test('empty entity (&;) is escaped', () => compare('export const X = () => <div>a&;b</div>'))
  test('hash-only (&#;) is escaped', () => compare('export const X = () => <div>a&#;b</div>'))
  test('underscore in named entity is preserved', () => compare('export const X = () => <div>a&a_1;b</div>'))
})

describeNative('Native vs JS equivalence — rocketstyle collapse (full variant)', () => {
  const MODE = { name: 'useMode', source: '@pyreon/zero' }
  interface Site {
    templateHtml: string
    lightClass: string
    darkClass: string
    rules: string[]
    ruleKey: string
  }
  // Compare JS vs native collapse emission. `sites` is keyed by a
  // [component, props, childrenText] tuple → resolved Site; we compute the
  // canonical FNV key both backends use so the lookup matches. JS gets a
  // Set/Map config; native gets the array/Record napi shape — same data.
  function cmp(
    input: string,
    candidates: string[],
    entries: Array<[string, Record<string, string>, string, Site]>,
  ) {
    const sitesRecord: Record<string, Site> = {}
    for (const [comp, props, text, site] of entries) {
      sitesRecord[rocketstyleCollapseKey(comp, props, text)] = site
    }
    const jsCfg = {
      candidates: new Set(candidates),
      sites: new Map(Object.entries(sitesRecord)),
      mode: MODE,
    }
    const napiCfg = { candidates, sites: sitesRecord, mode: MODE }
    const js = transformJSX_JS(input, 'test.tsx', {
      collapseRocketstyle: jsCfg as never,
    }).code
    // 6th native arg is the collapse config (typed loosely here).
    const rs = (nativeTransform as unknown as (...a: unknown[]) => { code: string })!(
      input,
      'test.tsx',
      false,
      null,
      false,
      napiCfg,
    ).code
    expect(rs).toBe(js)
  }

  const SITE: Site = {
    templateHtml: '<button><span>Save</span></button>',
    lightClass: 'btn-l',
    darkClass: 'btn-d',
    rules: ['.btn-l{color:#000}', '.btn-d{color:#fff}'],
    ruleKey: 'rk1',
  }

  test('top-level full collapse (no braces)', () =>
    cmp(`export const C = () => <Button state="primary">Save</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))

  test('fragment-child full collapse (brace-wrapped)', () =>
    cmp(`export const C = () => <><Button state="primary">Save</Button></>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))

  test('multi-prop (sorted-key canonical)', () =>
    cmp(`export const C = () => <Button size="md" state="primary">Save</Button>`, ['Button'], [
      ['Button', { state: 'primary', size: 'md' }, 'Save', SITE],
    ]))

  test('unresolved key keeps the normal mount', () =>
    cmp(`export const C = () => <Button state="secondary">X</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))

  test('non-candidate component is not collapsed', () =>
    cmp(`export const C = () => <Other state="primary">Save</Other>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))

  test('dynamic prop ({expr}) bails (full detector)', () =>
    cmp(`export const C = (p) => <Button state={p.s}>Save</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))

  test('two sites sharing a ruleKey → injectRules deduped once', () =>
    cmp(
      `export const C = () => <div><Button state="primary">Save</Button><Button state="primary">Save</Button></div>`,
      ['Button'],
      [['Button', { state: 'primary' }, 'Save', SITE]],
    ))

  test('templateHtml/class with quotes + control chars escape like JSON.stringify', () =>
    cmp(`export const C = () => <Button state="primary">Save</Button>`, ['Button'], [
      [
        'Button',
        { state: 'primary' },
        'Save',
        {
          templateHtml: '<button title="a&quot;b"><span>S</span></button>',
          lightClass: 'l "q"',
          darkClass: 'd\\x',
          rules: ['.l{content:"\\""}'],
          ruleKey: 'rk2',
        },
      ],
    ]))
})

describeNative('Native vs JS equivalence — rocketstyle collapse (on*-handler partial)', () => {
  const MODE = { name: 'useMode', source: '@pyreon/zero' }
  interface Site {
    templateHtml: string
    lightClass: string
    darkClass: string
    rules: string[]
    ruleKey: string
  }
  // Same harness as the full-variant block, exercising the `__rsCollapseH`
  // (on*-handler partial) path: a literal-prop site with ≥1 `on[A-Z]…` handler
  // peels the handlers into a re-emitted object literal while the literal-prop
  // subset still feeds the UNCHANGED key. Both backends must emit byte-identically.
  function cmpH(
    input: string,
    candidates: string[],
    entries: Array<[string, Record<string, string>, string, Site]>,
  ) {
    const sitesRecord: Record<string, Site> = {}
    for (const [comp, props, text, site] of entries) {
      sitesRecord[rocketstyleCollapseKey(comp, props, text)] = site
    }
    const jsCfg = {
      candidates: new Set(candidates),
      sites: new Map(Object.entries(sitesRecord)),
      mode: MODE,
    }
    const napiCfg = { candidates, sites: sitesRecord, mode: MODE }
    const js = transformJSX_JS(input, 'test.tsx', {
      collapseRocketstyle: jsCfg as never,
    }).code
    const rs = (nativeTransform as unknown as (...a: unknown[]) => { code: string })!(
      input,
      'test.tsx',
      false,
      null,
      false,
      napiCfg,
    ).code
    expect(rs).toBe(js)
  }

  const SITE: Site = {
    templateHtml: '<button><span>Save</span></button>',
    lightClass: 'btn-l',
    darkClass: 'btn-d',
    rules: ['.btn-l{color:#000}', '.btn-d{color:#fff}'],
    ruleKey: 'rk1',
  }

  test('single handler, top-level (no braces) — emits __rsCollapseH + both imports', () =>
    cmpH(`export const C = () => <Button state="primary" onClick={() => go()}>Save</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))

  test('handler site as a JSX child is brace-wrapped', () =>
    cmpH(
      `export const C = () => <div><Button state="primary" onClick={() => go()}>Save</Button></div>`,
      ['Button'],
      [['Button', { state: 'primary' }, 'Save', SITE]],
    ))

  test('multiple handlers + multi-prop (sorted key)', () =>
    cmpH(
      `export const C = () => <Button size="md" state="primary" onClick={h1} onMouseEnter={() => h2(1)}>Save</Button>`,
      ['Button'],
      [['Button', { state: 'primary', size: 'md' }, 'Save', SITE]],
    ))

  test('handler with a comma-sequence body stays one argument (paren-wrapped)', () =>
    cmpH(
      `export const C = () => <Button state="primary" onClick={(e) => (e.stopPropagation(), go())}>Save</Button>`,
      ['Button'],
      [['Button', { state: 'primary' }, 'Save', SITE]],
    ))

  test('handler-only (no other props)', () =>
    cmpH(`export const C = () => <Button onClick={h}>Save</Button>`, ['Button'], [
      ['Button', {}, 'Save', SITE],
    ]))

  test('unresolved key keeps the normal mount', () =>
    cmpH(`export const C = () => <Button state="secondary" onClick={h}>X</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))

  test('a non-handler {expr} prop bails both full AND partial', () =>
    cmpH(`export const C = (p) => <Button state={p.s} onClick={h}>Save</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))

  test('zero handlers → full path, never __rsCollapseH', () =>
    cmpH(`export const C = () => <Button state="primary">Save</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', SITE],
    ]))
})
