/**
 * Template child/attr CLASSIFICATION seam — two root-cause fixes, one theme:
 * shapes that should be LIVE (or mounted) were silently stringified.
 *
 * PZ-05 — TS type-only layers (`as T` / `satisfies T` / non-null `!`) and
 * parens are value-transparent, but the template classifier didn't unwrap
 * them: `{(() => name()) as never}` fell through to the STATIC bake arm and
 * emitted `__root.textContent = (() => name()) as never` — rendering the
 * function SOURCE as literal text. Same for attrs (`title={(() => x()) as
 * never}` → static setAttribute of the source string). Fix: unwrap
 * `unwrapTypeLayers` (the auto-call pass's "parens/TS-layer transparent"
 * helper) at BOTH classification seams, so `(expr) as never` compiles
 * byte-identically to `expr`.
 *
 * PZ-02 — a call to an in-file JSX-returning helper (`const cell = (v) =>
 * <b>{v}</b>` … `<td>{cell(x)}</td>`) was classified as reactive TEXT and
 * emitted `_bind(() => { __t0.data = cell(x) })` → "[object Object]". SSR
 * mounted the shape correctly, so it was also a guaranteed SSR↔client
 * mismatch. Fix: track JSX-returning function bindings (scope-aware, same
 * discipline as the signal auto-call pass) and route their calls through
 * `_mountSlot(() => (cell(x)), …)` — reactivity preserved when args read
 * signals, string/number returns still render correctly (mountChild handles
 * every child type). Cross-file callees are OUT of scope (no type info at
 * this seam) — they keep the reactive-text path.
 *
 * Both fixes are mirrored byte-identically in the Rust backend (the
 * describeNative blocks below + the seeded fuzz grammar police the seam).
 */
import { transformJSX_JS } from '../jsx'

// Load native if available (same convention as native-equivalence.test.ts).
let nativeTransform:
  | ((code: string, filename: string, ssr: boolean, known: string[] | null) => { code: string })
  | null = null
try {
  const path = require('node:path')
  const native = require(path.join(__dirname, '..', '..', 'native', 'pyreon-compiler.node'))
  nativeTransform = native.transformJsx
} catch {
  // Native not available — cross-backend blocks skip.
}
const describeNative = nativeTransform ? describe : describe.skip

const js = (src: string) => transformJSX_JS(src, 'test.tsx').code

function compareBackends(src: string): void {
  const jsOut = transformJSX_JS(src, 'test.tsx').code
  const rsOut = nativeTransform!(src, 'test.tsx', false, null).code
  expect(rsOut).toBe(jsOut)
  const jsSsr = transformJSX_JS(src, 'test.tsx', { ssr: true }).code
  const rsSsr = nativeTransform!(src, 'test.tsx', true, null).code
  expect(rsSsr).toBe(jsSsr)
}

// ─── PZ-05: TS-layer transparency at the child/attr classification seam ─────

describe('PZ-05 — TS casts are transparent to the template classifier (JS backend)', () => {
  const SIG = `import { signal } from '@pyreon/reactivity'
const name = signal('a')
`
  it('cast accessor child compiles byte-identically to the uncast form', () => {
    const uncast = js(`${SIG}const App = () => <div>{() => name()}</div>`)
    for (const wrapped of [
      `${SIG}const App = () => <div>{(() => name()) as never}</div>`,
      `${SIG}const App = () => <div>{(() => name()) satisfies unknown}</div>`,
      `${SIG}const App = () => <div>{(() => name())!}</div>`,
      `${SIG}const App = () => <div>{(() => name())}</div>`,
    ]) {
      expect(js(wrapped)).toBe(uncast)
    }
    // The classification is the LIVE _bindText fast path — not a static bake.
    expect(uncast).toContain('_bindText(name, __t0)')
    expect(uncast).not.toContain('textContent = (() =>')
  })

  it('cast attr compiles byte-identically to the uncast form (live _bindDirect)', () => {
    const SIGX = `import { signal } from '@pyreon/reactivity'
const x = signal('a')
`
    const uncast = js(`${SIGX}const App = () => <div title={() => x()}>hi</div>`)
    for (const wrapped of [
      `${SIGX}const App = () => <div title={(() => x()) as never}>hi</div>`,
      `${SIGX}const App = () => <div title={(() => x()) satisfies unknown}>hi</div>`,
      `${SIGX}const App = () => <div title={(() => x())!}>hi</div>`,
    ]) {
      expect(js(wrapped)).toBe(uncast)
    }
    expect(uncast).toContain('_bindDirect(x,')
    expect(uncast).not.toContain('setAttribute("title", (() =>')
  })

  it('cast called-signal child promotes to _bindText like the uncast form', () => {
    const uncast = js(`${SIG}const App = () => <div>{name()}</div>`)
    expect(js(`${SIG}const App = () => <div>{name() as never}</div>`)).toBe(uncast)
    expect(uncast).toContain('_bindText(name, __t0)')
  })

  it('cast bare-signal child auto-calls like the uncast form', () => {
    const uncast = js(`${SIG}const App = () => <div>{name}</div>`)
    expect(js(`${SIG}const App = () => <div>{(name) as never}</div>`)).toBe(uncast)
    expect(uncast).toContain('bindPolymorphicText(() => (name()), __t0, __root)')
  })

  it('cast static literal child bakes byte-identically to the plain literal', () => {
    const uncast = js(`const App = () => <div>{"hello"}</div>`)
    expect(js(`const App = () => <div>{("hello") as string}</div>`)).toBe(uncast)
    expect(uncast).toContain('_setChild(__root, "hello")')
  })

  it('cast static object style applies once via _setStyle like the uncast form', () => {
    const uncast = js(`const App = () => <div style={{ color: 'red' }}>hi</div>`)
    expect(js(`const App = () => <div style={{ color: 'red' } as object}>hi</div>`)).toBe(uncast)
    expect(uncast).toContain(`_setStyle(__root, { color: 'red' })`)
  })

  it('cast-wrapped direct JSX child mounts via _mountSlot (never stringifies)', () => {
    // The UNCAST form (`{<span/>}`) bails the template upstream and keeps the
    // static-hoist path — the cast form reaches the classifier and must MOUNT.
    const out = js(`const App = () => <div>{(<span/>) as never}</div>`)
    expect(out).toContain('_mountSlot(<span/>, __root, __p0)')
    expect(out).not.toContain('textContent')
  })

  it('component-prop casts stay pass-through (never broken; locked for parity)', () => {
    const SIGX = `import { signal } from '@pyreon/reactivity'
const x = signal(0)
`
    const out = js(
      `${SIGX}const App = () => <div><Comp title={(() => x()) as never} /><span>s</span></div>`,
    )
    // The accessor function passes through as a prop value (cast erased by
    // the downstream bundler) — no template setAttribute of source text.
    expect(out).toContain('title={(() => x()) as never}')
    expect(out).not.toContain('setAttribute')
  })
})

// ─── PZ-02: in-file JSX-returning helper calls MOUNT via _mountSlot ─────────

describe('PZ-02 — JSX-returning local-helper calls are mounted, not stringified (JS backend)', () => {
  it('argful call routes through _mountSlot wrapped in an accessor', () => {
    const out = js(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`)
    expect(out).toContain('_mountSlot(() => (cell(props.s)), __root, __p0)')
    expect(out).not.toContain('__t0.data = cell(')
  })

  it('zero-arg call routes through _mountSlot (pre-fix it mis-bound via _bindText)', () => {
    const out = js(`const icon = () => <b>x</b>
const App = () => <td>{icon()}</td>`)
    expect(out).toContain('_mountSlot(() => (icon()), __root, __p0)')
    expect(out).not.toContain('_bindText(icon')
  })

  it('accessor form {() => cell(x)} routes through _mountSlot', () => {
    const out = js(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>{() => cell(props.s)}</td>`)
    expect(out).toContain('_mountSlot(() => (cell(props.s)), __root, __p0)')
  })

  it('function DECLARATION helper (declared before use) routes through _mountSlot', () => {
    const out = js(`function cell(v: string) { return <b>{v}</b> }
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`)
    expect(out).toContain('_mountSlot(() => (cell(props.s)), __root, __p0)')
  })

  it('conditional string|VNode-returning helper still routes (mountChild handles both)', () => {
    const out = js(`const cell = (v: string) => v ? <b>{v}</b> : 'none'
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`)
    expect(out).toContain('_mountSlot(() => (cell(props.s)), __root, __p0)')
  })

  it('SHADOWED callee is NOT routed (scope-aware, mirrors the auto-call discipline)', () => {
    const out = js(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => { const cell = (v: string) => v.toUpperCase(); return <td>{cell(props.s)}</td> }`)
    expect(out).toContain('bindPolymorphicText(() => (cell(props.s)), __t0, __root)')
    expect(out).not.toContain('_mountSlot')
  })

  it('parameter-shadowed callee is NOT routed', () => {
    const out = js(`const cell = (v: string) => <b>{v}</b>
const App = (cell: (v: string) => string) => <td>{cell('x')}</td>`)
    expect(out).not.toContain('_mountSlot')
  })

  it('CROSS-FILE callee is NOT routed (no type info — documented boundary)', () => {
    const out = js(`import { cell } from './cells'
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`)
    expect(out).toContain('bindPolymorphicText(() => (cell(props.s)), __t0, __root)')
    expect(out).not.toContain('_mountSlot')
  })

  it('helper declared AFTER use is NOT tracked (source-order boundary, both backends agree)', () => {
    const out = js(`const App = (props: { s: string }) => <td>{cell(props.s)}</td>
function cell(v: string) { return <b>{v}</b> }`)
    expect(out).toContain('bindPolymorphicText(() => (cell(props.s)), __t0, __root)')
    expect(out).not.toContain('_mountSlot')
  })

  it('PZ-05 interaction: cast-wrapped helper call unwraps THEN classifies → mounted', () => {
    const uncast = js(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`)
    const cast = js(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>{(cell(props.s)) as never}</td>`)
    expect(cast).toBe(uncast)
    expect(cast).toContain('_mountSlot(() => (cell(props.s)), __root, __p0)')
  })

  it('mixed content keeps positional placeholders around the mounted helper', () => {
    const out = js(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>before {cell(props.s)} after</td>`)
    expect(out).toContain('_mountSlot(() => (cell(props.s))')
    expect(out).toContain('<td>before <!> after</td>')
  })

  it('SSR mode is untouched (the SSR renderer already mounts the shape)', () => {
    const out = transformJSX_JS(
      `const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`,
      'test.tsx',
      { ssr: true },
    ).code
    expect(out).toContain('<td>{() => cell(props.s)}</td>')
    expect(out).not.toContain('_mountSlot')
  })
})

// ─── Cross-backend byte-equivalence for every new shape ─────────────────────

describeNative('PZ-05 + PZ-02 — JS ≡ Rust byte-equivalence (client + SSR)', () => {
  const SIG = `import { signal } from '@pyreon/reactivity'
const name = signal('a')
`
  test('cast accessor child', () =>
    compareBackends(`${SIG}const App = () => <div>{(() => name()) as never}</div>`))
  test('satisfies accessor child', () =>
    compareBackends(`${SIG}const App = () => <div>{(() => name()) satisfies unknown}</div>`))
  test('non-null accessor child', () =>
    compareBackends(`${SIG}const App = () => <div>{(() => name())!}</div>`))
  test('parenthesized accessor child', () =>
    compareBackends(`${SIG}const App = () => <div>{(() => name())}</div>`))
  test('cast attr', () =>
    compareBackends(`${SIG}const App = () => <div title={(() => name()) as never}>hi</div>`))
  test('satisfies attr', () =>
    compareBackends(
      `${SIG}const App = () => <div title={(() => name()) satisfies unknown}>hi</div>`,
    ))
  test('cast called-signal child', () =>
    compareBackends(`${SIG}const App = () => <div>{name() as never}</div>`))
  test('cast bare-signal child', () =>
    compareBackends(`${SIG}const App = () => <div>{(name) as never}</div>`))
  test('cast static literal child', () =>
    compareBackends(`const App = () => <div>{("hello") as string}</div>`))
  test('cast static object style', () =>
    compareBackends(`const App = () => <div style={{ color: 'red' } as object}>hi</div>`))
  test('cast-wrapped direct JSX child', () =>
    compareBackends(`const App = () => <div>{(<span/>) as never}</div>`))
  test('component-prop cast pass-through', () =>
    compareBackends(
      `${SIG}const App = () => <div><Comp title={(() => name()) as never} /><span>s</span></div>`,
    ))
  test('helper call child (argful)', () =>
    compareBackends(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`))
  test('helper call child (zero-arg)', () =>
    compareBackends(`const icon = () => <b>x</b>
const App = () => <td>{icon()}</td>`))
  test('helper accessor form', () =>
    compareBackends(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>{() => cell(props.s)}</td>`))
  test('function-declaration helper', () =>
    compareBackends(`function cell(v: string) { return <b>{v}</b> }
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`))
  test('conditional string|VNode helper', () =>
    compareBackends(`const cell = (v: string) => v ? <b>{v}</b> : 'none'
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`))
  test('parameter-shadowed callee (not routed)', () =>
    compareBackends(`const cell = (v: string) => <b>{v}</b>
const App = (cell: (v: string) => string) => <td>{cell('x')}</td>`))
  test('cross-file callee (not routed)', () =>
    compareBackends(`import { cell } from './cells'
const App = (props: { s: string }) => <td>{cell(props.s)}</td>`))
  test('helper declared after use (not tracked)', () =>
    compareBackends(`const App = (props: { s: string }) => <td>{cell(props.s)}</td>
function cell(v: string) { return <b>{v}</b> }`))
  test('cast helper call (PZ-05 interaction)', () =>
    compareBackends(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>{(cell(props.s)) as never}</td>`))
  test('mixed content around mounted helper', () =>
    compareBackends(`const cell = (v: string) => <b>{v}</b>
const App = (props: { s: string }) => <td>before {cell(props.s)} after</td>`))
})
