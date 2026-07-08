/**
 * Cross-backend equivalence tests.
 * Runs every test input through BOTH the JS and Rust implementations
 * and asserts identical output. This catches any behavioral divergence
 * between the two backends.
 */
import { rocketstyleCollapseKey, serializeStaticChildren, transformJSX_JS } from '../jsx'
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
  // single-disposer fast path: `return __d0` (no wrapper closure) — JS + Rust
  // must agree byte-for-byte on both the fast path and the multi-disposer wrapper.
  test('single-disposer template', () =>
    compare(`${sig}export const X = () => <div class="row"><span>{t()}</span></div>`))
  test('multi-disposer template', () =>
    compare(`${sig}export const X = () => <div class="row"><span>{t()}</span><span>{c()}</span></div>`))
  // dangerouslySetInnerHTML — must mirror the runtime (innerHTML = value.__html),
  // not a generic setAttribute (which stringifies the object to "[object Object]").
  // The wrapper div forces template-ization so the attr binding goes through attr_setter.
  test('dangerouslySetInnerHTML forwarded prop', () =>
    compare(
      `export const X = (props) => <div class="cb"><div dangerouslySetInnerHTML={props.html} /></div>`,
    ))
  test('dangerouslySetInnerHTML direct signal ref', () =>
    compare(
      `${sig}export const X = () => <div class="cb"><div dangerouslySetInnerHTML={t} /></div>`,
    ))
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
  // ARROW / function-EXPRESSION components: the prop-derived span lookup must
  // descend into the component body (it lives one function level below the
  // top-level statement). Pre-fix, find_init_expression_by_span never reached
  // these, so transitive resolution fell back to raw source — `const b = a + 1`
  // emitted `(a + 1)` (a unresolved, reactivity lost) instead of `((props.x) + 1)`.
  // Function-DECLARATION components masked the bug (their body IS descended).
  test('arrow component — transitive chain', () =>
    compare('const Comp = (props) => { const a = props.x; const b = a + 1; return <div>{b}</div> }'))
  test('arrow component — deep chain', () =>
    compare(
      'const Comp = (props) => { const a = props.x; const b = a; const c = b + 1; return <div>{c}</div> }',
    ))
  test('export const arrow component — transitive chain', () =>
    compare(
      'export const Comp = (props) => { const a = props.x; const b = a + 1; return <div>{b}</div> }',
    ))
  test('arrow component — transitive in attr', () =>
    compare(
      'const Comp = (props) => { const base = props.cls; const full = base + " on"; return <div class={full}></div> }',
    ))
  test('function-expression component — transitive chain', () =>
    compare(
      'const Comp = function (props) { const a = props.x; const b = a + 1; return <div>{b}</div> }',
    ))
  test('export default arrow component — transitive chain', () =>
    compare(
      'export default (props) => { const a = props.x; const b = a + 1; return <div>{b}</div> }',
    ))
  test('export default arrow component — 1-level prop read', () =>
    compare('export default (props) => { return <div>{props.x}</div> }'))
  test('function-expression component — 1-level prop read', () =>
    compare('const Comp = function (props) { return <div>{props.x}</div> }'))
})

// A prop-derived const referenced inside an event-handler / accessor function
// body is a DEFERRED read — it must inline to the live prop source so the
// handler reads the current value, not a setup-time snapshot. JS descends one
// level into the binding-function's body (`accessesProps`'s child-skip skips
// NESTED functions but yields the body as a child); RS previously returned
// false for any arrow/function in `accesses_props`, so the native backend shipped
// the stale-capture form in production (the dispatcher prefers native). The
// gate-only `fn_body_accesses_props` restores the 1-level descent; the inliner
// already matched JS once the gate passes. These lock both the descent AND the
// nested-function skip (so they can't drift back to either extreme).
describeNative('Native vs JS equivalence — prop-derived in handler/accessor bodies', () => {
  test('inline arrow handler inlines prop-derived (live read)', () =>
    compare(
      'const C = (props) => { const a = props.x; return <button onClick={() => send(a)}>g</button> }',
    ))
  test('block-body multi-statement handler', () =>
    compare(
      'const C = (props) => { const a = props.x; return <button onClick={(e) => { e.preventDefault(); send(a) }}>g</button> }',
    ))
  test('two prop-derived in one handler', () =>
    compare(
      'const C = (props) => { const a = props.x; const b = props.y; return <button onClick={() => send(a, b)}>g</button> }',
    ))
  test('direct props in handler stays props', () =>
    compare('const C = (props) => <button onClick={() => send(props.x)}>g</button>'))
  test('handler with if/for/try body shapes', () =>
    compare(
      'const C = (props) => { const a = props.x; return <button onClick={() => { if (a) { send(a) } for (let i = 0; i < a; i++) {} try { use(a) } catch (e) {} }}>g</button> }',
    ))
  // The nested-function SKIP: a prop-derived ref reachable only through a
  // DEEPER function stays raw (JS's child-skip) — must not over-inline.
  test('nested arrow inside handler stays raw (skip)', () =>
    compare(
      'const C = (props) => { const a = props.x; return <button onClick={() => foo(() => send(a))}>g</button> }',
    ))
  test('arrow-returning-arrow handler stays raw (skip)', () =>
    compare(
      'const C = (props) => { const a = props.x; return <button onClick={() => () => send(a)}>g</button> }',
    ))
  test('function arg in a JSX-child call (not a handler) stays raw', () =>
    compare('const C = (props) => { const a = props.x; return <s>{foo(() => send(a))}</s> }'))
  test('local shadow inside handler is not inlined', () =>
    compare(
      'const C = (props) => { const a = props.x; return <button onClick={() => { const a = 5; send(a) }}>g</button> }',
    ))
})

// A SEPARATELY-DECLARED function const whose body reads a prop-derived var (or
// props directly) registers as prop-derived, so its use site inlines the value
// — the deferred function reads the LIVE prop, not a setup-time snapshot. JS
// descends into function bodies in `referencesPropDerived` / `readsFromProps`
// (membership-only, no shadow filter); RS previously had `_ => false` arms, so a
// named handler (`const f = () => send(a); onClick={f}`) or locally-called fn
// (`const f = () => i; {f()}`) shipped the stale-capture form on the native
// backend. Closed by function-body descent in both registration helpers + a
// prop-derived-callee resolution in the `_bindText` nullary-call fast path.
describeNative('Native vs JS equivalence — prop-derived in separately-declared functions', () => {
  test('named handler reference inlines f value (live read)', () =>
    compare(
      'const C = (props) => { const a = props.x; const f = () => send(a); return <button onClick={f}>g</button> }',
    ))
  test('named block-body handler reference', () =>
    compare(
      'const C = (props) => { const a = props.x; const f = (e) => { e.preventDefault(); send(a) }; return <form onSubmit={f}><i/></form> }',
    ))
  test('local function called in JSX expression rewrites to live read', () =>
    compare(
      'const C = (props) => { const i = props.start; const f = () => { for (let i = 0; i < 3; i++) {} return i }; return <s>{f()}</s> }',
    ))
  test('simple local function call', () =>
    compare('const C = (props) => { const a = props.x; const f = () => a + 1; return <s>{f()}</s> }'))
  test('function reading props directly registers + inlines', () =>
    compare('const C = (props) => { const f = () => props.x; return <button onClick={f}>g</button> }'))
  test('local shadow inside named function is over-registered like JS', () =>
    compare(
      'const C = (props) => { const a = props.x; const f = () => { const a = 5; send(a) }; return <button onClick={f}>g</button> }',
    ))
  test('function NOT reading props/prop-derived stays a raw reference', () =>
    compare('const C = (props) => { const f = () => send(1); return <button onClick={f}>g</button> }'))
  test('transitive: const used in a named function body', () =>
    compare(
      'const C = (props) => { const a = props.x; const b = a + 1; const f = () => use(b); return <button onClick={f}>g</button> }',
    ))
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

describeNative('Native vs JS equivalence — select value binding (PZ-09)', () => {
  // <select value> is never baked (dead content attribute) and its bind
  // line — static one-time property set AND `_bindDirect` — is deferred
  // past the element's children lines. Both backends must agree on the
  // skip, the deferral, AND the `escapeJsString`/`escape_js_string`
  // serialization of the plain-string form.
  test('static plain-string value + static options', () => {
    compare('<select value="b"><option value="a">A</option><option value="b">B</option></select>')
  })
  test('static expression-container values (string/number/template/signed/as-const)', () => {
    compare('<select value={"b"}><option/></select>')
    compare('<select value={3}><option/></select>')
    compare('<select value={`b`}><option/></select>')
    compare('<select value={-1}><option/></select>')
    compare('<select value={"b" as const}><option/></select>')
  })
  test('omit-semantic shapes emit nothing', () => {
    compare('<select value={undefined}><option/></select>')
    compare('<select value={null}><option/></select>')
    compare('<select value={false}><option/></select>')
  })
  test('reactive value + dynamic options — deferred _bindDirect after _mountSlot', () => {
    compareWithSignals(
      'const sig = signal("b"); const x = <select value={() => sig()}>{items.map((i) => <option value={i}>{i}</option>)}</select>',
      ['sig'],
    )
  })
  test('reactive value + static options (control — single-binding fast path)', () => {
    compareWithSignals(
      'const sig = signal("b"); const x = <select value={() => sig()}><option value="a">A</option></select>',
      ['sig'],
    )
  })
  test('quote-carrying plain-string value (escapeJsString parity)', () => {
    compare(`<select value='a"b'><option/></select>`)
  })
  test('nested select needs a phase-1 element ref', () => {
    compare('<div><span>x</span><select value="b"><option/></select></div>')
  })
  test('mixed attrs: id bakes, listener + value keep their relative slots', () => {
    compare(
      '<select id="s" value="b" onChange={(e) => f(e)}>{items.map((i) => <option value={i}>{i}</option>)}</select>',
    )
  })
  test('control: input/textarea value untouched', () => {
    compare('<div><input value="b" /></div>')
    compare('<div><textarea value="b"></textarea></div>')
  })
  test('SSR mode is unaffected (no template emit)', () => {
    compareSsr('<select value="b"><option value="a">A</option></select>')
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

describeNative('Native vs JS equivalence — element-conditional templatization', () => {
  // A DOM wrapper around an inline element-conditional keeps the `_tpl` fast
  // path and routes the conditional child through `_mountSlot` (previously the
  // whole wrapper bailed to the jsx runtime). Both backends must emit this
  // byte-identically.
  test('ternary returning components', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const open = signal(false)
      export const X = () => <div class="card">{open() ? <Panel/> : <Empty/>}</div>
    `))
  test('ternary returning DOM elements', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const open = signal(false)
      export const X = () => <div>{open() ? <span>A</span> : <b>B</b>}</div>
    `))
  test('logical-and returning a component', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const n = signal(0)
      export const X = () => <section>{n() > 0 && <List/>}</section>
    `))
  test('static (non-signal) element-conditional mounts once (bare slot arg)', () =>
    compare(`export const X = (p) => <div>{p.cond ? <a/> : <b/>}</div>`))
  test('.map returning DOM elements', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const items = signal([])
      export const X = () => <ul>{items().map((x) => <li>{x}</li>)}</ul>
    `))
  test('mixed: static element sibling + element-conditional', () =>
    compare(`
      import { signal } from '@pyreon/reactivity'
      const show = signal(false)
      export const X = () => <div><span>hdr</span>{show() && <em>body</em>}</div>
    `))
  test('DIRECT static JSX child still hoists (NOT mountSlot)', () =>
    compare(`export const X = () => <div>{<span>Hi</span>}</div>`))
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

describeNative('Native vs JS equivalence — rocketstyle collapse (dynamic variant)', () => {
  const MODE = { name: 'useMode', source: '@pyreon/zero' }
  interface Site {
    templateHtml: string
    lightClass: string
    darkClass: string
    rules: string[]
    ruleKey: string
  }
  // Same harness, exercising the dynamic-prop path: a ternary-of-two-literals
  // dimension prop expands into TWO resolver lookups (one per literal value),
  // emitting `__rsCollapseDyn` (no handlers) or `__rsCollapseDynH` (with). Each
  // fixture supplies both expanded sites. Byte-identical JS↔native.
  function cmpD(
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

  // Two resolved sites (primary/secondary) with IDENTICAL templateHtml (the
  // cross-value parity the dispatcher requires) but distinct classes + rules.
  const PRIMARY: Site = {
    templateHtml: '<button><span>Save</span></button>',
    lightClass: 'p-l',
    darkClass: 'p-d',
    rules: ['.p-l{color:#000}', '.p-d{color:#fff}'],
    ruleKey: 'rkP',
  }
  const SECONDARY: Site = {
    templateHtml: '<button><span>Save</span></button>',
    lightClass: 's-l',
    darkClass: 's-d',
    rules: ['.s-l{color:#333}'],
    ruleKey: 'rkS',
  }
  const SECONDARY_DIVERGENT: Site = { ...SECONDARY, templateHtml: '<button class=x><span>Save</span></button>' }
  const both = (extra: Record<string, string> = {}): Array<[string, Record<string, string>, string, Site]> => [
    ['Button', { ...extra, state: 'primary' }, 'Save', PRIMARY],
    ['Button', { ...extra, state: 'secondary' }, 'Save', SECONDARY],
  ]

  test('no-handler ternary → __rsCollapseDyn (stride-2 classes)', () =>
    cmpD(`export const C = (p) => <Button state={p.on ? 'primary' : 'secondary'}>Save</Button>`, ['Button'], both()))

  test('ternary + handler → __rsCollapseDynH', () =>
    cmpD(
      `export const C = (p) => <Button state={p.on ? 'primary' : 'secondary'} onClick={() => go()}>Save</Button>`,
      ['Button'],
      both(),
    ))

  test('ternary + extra literal prop (sorted key)', () =>
    cmpD(
      `export const C = (p) => <Button size="md" state={p.on ? 'primary' : 'secondary'}>Save</Button>`,
      ['Button'],
      both({ size: 'md' }),
    ))

  test('dynamic site as a JSX child is brace-wrapped', () =>
    cmpD(
      `export const C = (p) => <div><Button state={p.on ? 'primary' : 'secondary'}>Save</Button></div>`,
      ['Button'],
      both(),
    ))

  test('complex cond expression is re-emitted verbatim', () =>
    cmpD(
      `export const C = (p) => <Button state={p.a && p.b > 2 ? 'primary' : 'secondary'}>Save</Button>`,
      ['Button'],
      both(),
    ))

  test('multiple handlers + ternary', () =>
    cmpD(
      `export const C = (p) => <Button state={p.on ? 'primary' : 'secondary'} onClick={h1} onFocus={() => h2()}>Save</Button>`,
      ['Button'],
      both(),
    ))

  test('half-resolved (only truthy site) keeps normal mount', () =>
    cmpD(`export const C = (p) => <Button state={p.on ? 'primary' : 'secondary'}>Save</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', PRIMARY],
    ]))

  test('divergent templateHtml across values bails', () =>
    cmpD(`export const C = (p) => <Button state={p.on ? 'primary' : 'secondary'}>Save</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, 'Save', PRIMARY],
      ['Button', { state: 'secondary' }, 'Save', SECONDARY_DIVERGENT],
    ]))

  test('two ternaries (multi-axis) bail entirely', () =>
    cmpD(
      `export const C = (p) => <Button state={p.a ? 'primary' : 'secondary'} size={p.b ? 'md' : 'lg'}>Save</Button>`,
      ['Button'],
      both(),
    ))

  test('non-literal ternary branch bails', () =>
    cmpD(`export const C = (p) => <Button state={p.on ? p.x : 'secondary'}>Save</Button>`, ['Button'], both()))

  test('two dynamic sites share a value → rules deduped', () =>
    cmpD(
      `export const C = (p) => <div><Button state={p.a ? 'primary' : 'secondary'}>Save</Button><Button state={p.b ? 'primary' : 'secondary'}>Save</Button></div>`,
      ['Button'],
      both(),
    ))
})

describeNative('Native vs JS equivalence — rocketstyle collapse (element-child variant)', () => {
  const MODE = { name: 'useMode', source: '@pyreon/zero' }
  interface Site {
    templateHtml: string
    lightClass: string
    darkClass: string
    rules: string[]
    ruleKey: string
  }
  type StaticChild = string | { tag: string; props: Record<string, string>; children: StaticChild[] }
  // Element-child sites key on `serializeStaticChildren(childTree)` as the
  // childrenText arg. We build the childTree literally + compute the key via the
  // SAME exported serializer the JS detector uses, so a matching native serialize
  // produces a matching key (collapse); a divergent serialize → key mismatch →
  // one backend collapses while the other keeps the mount → the diff fails.
  function cmpE(
    input: string,
    candidates: string[],
    entries: Array<[string, Record<string, string>, StaticChild[], Site]>,
  ) {
    const sitesRecord: Record<string, Site> = {}
    for (const [comp, props, childTree, site] of entries) {
      const childrenKey = serializeStaticChildren(childTree as never)
      sitesRecord[rocketstyleCollapseKey(comp, props, childrenKey)] = site
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
  const T = (tag: string, props: Record<string, string>, children: StaticChild[]): StaticChild => ({
    tag,
    props,
    children,
  })
  const SITE: Site = {
    templateHtml: '<button class=c><span class=ico>Save</span></button>',
    lightClass: 'b-l',
    darkClass: 'b-d',
    rules: ['.b-l{color:#000}'],
    ruleKey: 'rkE',
  }

  test('single element child → baked __rsCollapse', () =>
    cmpE(`export const C = () => <Button state="primary"><span class="ico">Save</span></Button>`, ['Button'], [
      ['Button', { state: 'primary' }, [T('span', { class: 'ico' }, ['Save'])], SITE],
    ]))

  test('mixed text + element + text (clean_jsx_text + serialize parity)', () =>
    cmpE(`export const C = () => <Button state="primary">Press <kbd>Enter</kbd> now</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, ['Press ', T('kbd', {}, ['Enter']), ' now'], SITE],
    ]))

  test('recursive nesting (span > b)', () =>
    cmpE(`export const C = () => <Button state="primary"><span><b>Hi</b></span></Button>`, ['Button'], [
      ['Button', { state: 'primary' }, [T('span', {}, [T('b', {}, ['Hi'])])], SITE],
    ]))

  test('element child with multiple props (sorted key)', () =>
    cmpE(`export const C = () => <Button state="primary"><i data-x="1" class="a">x</i></Button>`, ['Button'], [
      ['Button', { state: 'primary' }, [T('i', { class: 'a', 'data-x': '1' }, ['x'])], SITE],
    ]))

  test('element-child site as a JSX child is brace-wrapped', () =>
    cmpE(
      `export const C = () => <div><Button state="primary"><span class="ico">Save</span></Button></div>`,
      ['Button'],
      [['Button', { state: 'primary' }, [T('span', { class: 'ico' }, ['Save'])], SITE]],
    ))

  test('text-only children → FULL path, never element-child', () =>
    cmpE(`export const C = () => <Button state="primary">Save</Button>`, ['Button'], [
      ['Button', { state: 'primary' }, ['Save'], SITE],
    ]))

  test('component (uppercase) child bails', () =>
    cmpE(`export const C = () => <Button state="primary"><Inner/></Button>`, ['Button'], [
      ['Button', { state: 'primary' }, [T('span', {}, [])], SITE],
    ]))

  test('handler on a child bails (cannot bake a handler)', () =>
    cmpE(`export const C = () => <Button state="primary"><span onClick={h}>x</span></Button>`, ['Button'], [
      ['Button', { state: 'primary' }, [T('span', {}, ['x'])], SITE],
    ]))

  test('expression child bails', () =>
    cmpE(`export const C = (p) => <Button state="primary"><span>{p.x}</span></Button>`, ['Button'], [
      ['Button', { state: 'primary' }, [T('span', {}, [])], SITE],
    ]))

  test('unresolved key keeps the normal mount', () =>
    cmpE(`export const C = () => <Button state="secondary"><span class="ico">Save</span></Button>`, ['Button'], [
      ['Button', { state: 'primary' }, [T('span', { class: 'ico' }, ['Save'])], SITE],
    ]))

  test('dynamic root prop + element child bails (root not all-literal)', () =>
    cmpE(`export const C = (p) => <Button state={p.s}><span class="ico">Save</span></Button>`, ['Button'], [
      ['Button', { state: 'primary' }, [T('span', { class: 'ico' }, ['Save'])], SITE],
    ]))
})

// ── Corpus-sweep regression locks (2026-06 dual-backend deep validation) ──────
// A 644-file real-corpus byte-diff sweep surfaced three Rust-only divergences
// the curated fixtures missed. Each fix mirrors a JS-backend rule the Rust
// `contains_jsx_in_expr` / component-prop registration had not implemented.
// `compare()` asserts byte-identical output — these would FAIL against the
// pre-fix binary (verified via minimal repros: each flipped EQUAL false→true).
describeNative('Native vs JS equivalence — corpus-sweep regressions', () => {
  // (1) Optional-chained `.map` returning JSX is a VNODE child (`_mountSlot`),
  // NOT text (`_bind .data` → renders `[object Object]`). Rust
  // `contains_jsx_in_expr` lacked a ChainExpression arm. Hit `image.tsx`
  // (`img.formats?.map(f => <source/>)`).
  test('optional-chained .map returning JSX (ChainExpression)', () =>
    compare('<picture>{() => formats()?.map((f) => <source srcset={f} />)}</picture>'))
  test('optional-chained .map in keyed list', () =>
    compare('<ul>{() => rows()?.map((r) => <li key={r.id}>{r.label}</li>)}</ul>'))

  // (2) A `.map`/`.filter`/any CallExpression-argument callback's param is a
  // RUNTIME item, NOT reactive props — a bare property read (`item.label`)
  // bakes STATIC (`textContent`), not a per-row `_bind()` renderEffect. Rust
  // registered the callback param as a component prop because the
  // `in_jsx_child_callback` flag only covered DIRECT JSX-child callbacks, not
  // nested CallExpression-arg callbacks. Hit `AnimationsGroupDemo.tsx`
  // (`items().map((item) => <div key={item.id}><span>{item.label}</span></div>)`).
  test('.map item-param read in a compiled element bakes static', () =>
    compare(
      '<List>{() => items().map((item) => (<div key={item.id} style="p:8"><span>{item.label}</span></div>))}</List>',
    ))
  test('.map item-param text child (single)', () =>
    compare('<List>{() => items().map((t) => (<div key={t.id}>{t.message}</div>))}</List>'))
  test('function-expression .map callback param bakes static', () =>
    compare(
      '<List>{() => items().map(function (item) { return (<div key={item.id}><span>{item.x}</span></div>) })}</List>',
    ))
  test('attribute-value render fn param STAYS reactive props (not a call arg)', () =>
    compare('<Grid renderItem={(p) => <span>{p.label}</span>} />'))

  // (3) An IIFE `(() => { … return <jsx/> })()` carries its JSX in the CALLEE
  // (an inline arrow), not the arguments — a VNODE child (`_mountSlot`), not
  // text. Rust `contains_jsx_in_expr`'s CallExpression arm only checked
  // arguments. Hit `@pyreon/zero-content`'s `Playground.tsx`
  // (`{(() => { … return <iframe/> })()}`).
  test('IIFE returning JSX is a vnode child (CallExpression callee)', () =>
    compare('<div>{(() => { const x = 1; return <iframe src="x" /> })()}</div>'))
  test('IIFE returning JSX after statements', () =>
    compare('<section>{(() => { if (a) return null; return <article>{b()}</article> })()}</section>'))

  // (4) An array-of-JSX const (`const arr = [<a/>, <b/>]`) or a map-of-JSX
  // const (`const rows = items.map(i => <li/>)`) used as a bare `{x}` child is
  // a VNODE-COLLECTION child (`_mountSlot` -> `mountChild` renders arrays), NOT
  // text (`textContent = arr` -> "[object Object],[object Object]"). Both
  // backends must add such a binding to `element_vars` (see
  // `is_jsx_collection_init`). Reported migration finding: `<div>{vnodeArray}</div>`.
  test('array-of-JSX const child is a vnode collection (_mountSlot)', () =>
    compare('const arr = [<span>a</span>, <span>b</span>]; export const X = () => <div>{arr}</div>'))
  test('map-of-JSX const child is a vnode collection (_mountSlot)', () =>
    compare(
      'const items = [1, 2]; const rows = items.map((i) => <li>{i}</li>); export const X = () => <ul>{rows}</ul>',
    ))
  test('array-of-JSX with a conditional element (returnsJsxValue recursion)', () =>
    compare('const a = [c ? <b>x</b> : <i>y</i>, <span>z</span>]; export const X = () => <div>{a}</div>'))
  test('plain string const child STAYS text (no over-classification)', () =>
    compare("const s = 'hi'; export const X = () => <div>{s}</div>"))
  test('array-of-primitives const stays text (no JSX element → not a collection)', () =>
    compare('const nums = [1, 2, 3]; export const X = () => <div>{nums}</div>'))
  test('plain call (non-inline callee) returning JSX stays text-classified', () =>
    compare('<div>{renderThing()}</div>'))
})

describeNative('Native vs JS equivalence — bare-signal attribute → _bindDirect', () => {
  // The consistency fix: a bare signal attribute value (`class={active}`) binds
  // directly, matching the accessor form. Both backends must emit identically.
  test('class={sig} (bare)', () =>
    compareWithSignals(
      'function C(){ const active = signal(false); return <div class={active}><span/></div> }',
      ['active'],
    ))
  test('class={() => sig()} (accessor) — unchanged, still equal', () =>
    compareWithSignals(
      'function C(){ const active = signal(false); return <div class={() => active()}><span/></div> }',
      ['active'],
    ))
  test('style={sig} (bare)', () =>
    compareWithSignals(
      "function C(){ const color = signal('red'); return <div style={color}><span/></div> }",
      ['color'],
    ))
  test('data-attr={sig} (bare)', () =>
    compareWithSignals(
      'function C(){ const count = signal(0); return <div data-n={count}><span/></div> }',
      ['count'],
    ))
  test('selector identifier guard — class={sel} stays general (no bare-direct)', () =>
    compare(
      'function C(){ const sel = createSelector(signal(null)); return <div class={sel}><span/></div> }',
    ))
  test('bare signal in TEXT is unchanged (scope: attr-only)', () =>
    compareWithSignals(
      "function C(){ const name = signal(''); return <div>{name}</div> }",
      ['name'],
    ))
})
