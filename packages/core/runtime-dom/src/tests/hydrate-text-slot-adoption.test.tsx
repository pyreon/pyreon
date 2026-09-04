/**
 * Regression lock — a compiled MIXED-CONTENT text slot ADOPTS its SSR text node.
 *
 * THE DEFECT. The emit for `<p>Hello {n()}</p>` bakes a `<!>` placeholder and
 * used to inline `createTextNode("") + replaceChild` against it:
 *
 *     const __p0 = __root.firstChild.nextSibling   // the placeholder
 *     const __t0 = document.createTextNode("")
 *     __root.replaceChild(__t0, __p0)              // <- replaces the OPEN MARKER
 *     _bindText(n, __t0)
 *
 * That is right for a CLONE and wrong for an ADOPTED container, where the
 * placeholder ref resolves to the live `<!--$-->` opening the range that already
 * holds this slot's server-rendered text. The bind wrote the value into its
 * fresh node while the server's own text survived beside it:
 *
 *     SSR       <div class="b">Count: <!--$-->7<!--/$--></div>
 *     hydrated  <div class="b">Count: 77<!--/$--></div>
 *
 * `_mountSlot` has been marker-aware for ELEMENT slots since the compiled path
 * became a consumer of the SSR range; the text slot never joined that
 * agreement, because its swap is INLINE generated code the runtime cannot
 * intercept. `_textSlot` gives it the same clone-vs-marked-range
 * discrimination, so the element stays adopted AND renders once.
 *
 * WHY BOTH HALVES ARE ASSERTED. Correct output alone is satisfiable by giving
 * up — refusing the shape in the verifier makes the element rebuild, which is
 * also correct and was the first fix considered. The point of this one is that
 * it keeps ADOPTION, so every spec below checks node identity and the
 * `runtime.tpl.adopt` counter alongside the HTML. A future change that fixes
 * the duplication by rebuilding would pass an output-only suite.
 *
 * Every spec compiles REAL JSX through `transformJSX`, because vitest's own JSX
 * transform never emits `_tpl` and cannot reproduce any of this. Note the
 * transform prefers the NATIVE binary, so a JS-only change is not exercised
 * here at all — both backends emit `_textSlot`, locked by the compiler's
 * native-equivalence suite.
 *
 * Bisect: restoring the inlined `createTextNode + replaceChild` in either
 * backend fails the duplication specs with `expected 'Count: 77<!--/$-->'`.
 */
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _applyProps,
  _bindDirect,
  _bindText,
  _mountSlot,
  _textSlot,
  _setAttr,
  _setClass,
  _setStyle,
  _tpl,
  hydrateRoot,
  mount,
} from '../index'
import { bindPolymorphicText } from '../mount'

// ─── Counter sink ────────────────────────────────────────────────────────────
const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__
beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
  document.body.innerHTML = ''
})
const tplAdopted = () => counts['runtime.tpl.adopt'] ?? 0

// ─── Real-transform harness ──────────────────────────────────────────────────
const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _textSlot,
  bindPolymorphicText,
  h,
  Fragment,
  For,
  signal,
}
const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

/** The Pyreon transform leaves COMPONENT JSX for the app's downstream jsx
 * pass — lower it to h() so `new Function` can evaluate. */
const lowerResidualJsx = (code: string) =>
  transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compileApp(source: string, globals: Record<string, unknown> = {}): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

/** Every element + text node under `host`, document order. */
function snapshot(host: HTMLElement): Node[] {
  const out: Node[] = []
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n)
  return out
}

/** How many of the pre-hydration nodes are still in the tree afterwards. */
function retained(before: Node[], host: HTMLElement): number {
  const after = new Set(snapshot(host))
  return before.filter((n) => after.has(n)).length
}


/** SSR `tree`, hydrate `client` over it, and report what happened. */
async function roundTrip(tree: unknown, client: string) {
  const html = await renderToString(tree as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = snapshot(host)
  const App = compileApp(client)
  const dispose = hydrateRoot(host, h(App as never, null))
  return { html, host, before, dispose, out: host.innerHTML, kept: retained(before, host) }
}

describe('compiled mixed-content text slot adopts its SSR text', () => {
  it('static text then {dynamic}: renders ONCE and keeps every node', async () => {
    const { html, out, kept, before, dispose } = await roundTrip(
      h('p', { class: 'a' }, 'Hello ', () => 'Ada'),
      `const App = () => { const n = signal('Ada'); return <p class="a">Hello {n()}</p> }`,
    )
    expect(html).toBe('<p class="a">Hello <!--$-->Ada<!--/$--></p>')
    expect(out).toBe('<p class="a">Hello Ada</p>')
    expect(kept).toBe(before.length) // the SSR text node itself is ADOPTED
    expect(tplAdopted()).toBe(1)
    dispose()
  })

  it('label: {value} — the shape that hydrated to `Count: 77`', async () => {
    const { out, kept, before, dispose } = await roundTrip(
      h('div', { class: 'b' }, 'Count: ', () => '7'),
      `const App = () => { const c = signal('7'); return <div class="b">Count: {c()}</div> }`,
    )
    expect(out).toBe('<div class="b">Count: 7</div>')
    expect(kept).toBe(before.length)
    dispose()
  })

  it('a preceding ELEMENT sibling triggers it too', async () => {
    const { out, kept, before, dispose } = await roundTrip(
      h('p', { class: 'c' }, h('b', null, 'B'), () => 'tail'),
      `const App = () => { const t = signal('tail'); return <p class="c"><b>B</b>{t()}</p> }`,
    )
    expect(out).toBe('<p class="c"><b>B</b>tail</p>')
    expect(kept).toBe(before.length)
    dispose()
  })

  it('an EMPTY range leaves no marker litter', async () => {
    // The accessor rendered '' server-side, so the range holds no text at all.
    // The helper must still land a node the bind can write into, and consume
    // BOTH markers — a stray `<!--/$-->` would diverge from a client mount.
    const { out, dispose } = await roundTrip(
      h('p', { class: 'e' }, 'x', () => ''),
      `const App = () => { const t = signal(''); return <p class="e">x{t()}</p> }`,
    )
    expect(out).toBe('<p class="e">x</p>')
    dispose()
  })

  it('the adopted node stays live — adoption must not strand the binding', async () => {
    const { host, out, dispose } = await roundTrip(
      h('p', { class: 'r' }, 'v=', () => '1'),
      `const App = () => { const n = signal('1'); globalThis.__n = n; return <p class="r">v={n()}</p> }`,
    )
    expect(out).toBe('<p class="r">v=1</p>')
    ;(globalThis as { __n?: { set(v: string): void } }).__n?.set('2')
    expect(host.innerHTML).toBe('<p class="r">v=2</p>')
    dispose()
  })

  // ── Shapes that must be untouched ─────────────────────────────────────────
  it('a SOLE {dynamic} child still takes the baked-space path', async () => {
    const { html, out, kept, before, dispose } = await roundTrip(
      h('p', { class: 'd' }, () => 'only'),
      `const App = () => { const o = signal('only'); return <p class="d">{o()}</p> }`,
    )
    expect(html).toBe('<p class="d">only</p>') // markers elided, no placeholder
    expect(out).toBe('<p class="d">only</p>')
    expect(kept).toBe(before.length)
    dispose()
  })

  it('an all-static element is untouched', async () => {
    const { out, kept, before, dispose } = await roundTrip(
      h('p', { class: 'f' }, 'plain'),
      `const App = () => <p class="f">plain</p>`,
    )
    expect(out).toBe('<p class="f">plain</p>')
    expect(kept).toBe(before.length)
    dispose()
  })

  it('a CLONE (no adoption) still swaps a fresh node in', async () => {
    // The other half of the discrimination: mounted fresh, the placeholder is
    // the template's inert `<!>` and the helper must behave as the inlined
    // pair did. Guards against "fix adoption, break mounting".
    const App = compileApp(
      `const App = () => { const n = signal('Zoe'); return <p class="g">Hi {n()}</p> }`,
    )
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(App as never, null), host)
    expect(host.innerHTML).toBe('<p class="g">Hi Zoe</p>')
    dispose()
  })
})
