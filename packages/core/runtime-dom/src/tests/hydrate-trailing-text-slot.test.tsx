/**
 * Regression lock — a TRAILING reactive-text slot must not be adopted as a
 * MOUNT slot.
 *
 * THE BUG. The compiler bakes the same `<!>` placeholder for two slots whose
 * adoption contracts are opposites. A MOUNT slot is consumed by `_mountSlot`,
 * which is adoption-aware: handed the live `<!--$-->` it recognises the marked
 * range and hydrates into it. A reactive TEXT slot is consumed by `_bindText`
 * behind an INLINE `replaceChild` the runtime never sees:
 *
 *     const __p0 = __root.firstChild.nextSibling   // the placeholder
 *     const __t0 = document.createTextNode("")
 *     __root.replaceChild(__t0, __p0)              // <- replaces the OPEN MARKER
 *     _bindText(n, __t0)
 *
 * The verifier claimed any trailing range whose close marker was the element's
 * last child as a mount slot and left both markers standing. For a text bind
 * that meant the value was written into a fresh node while the server's own
 * text survived beside it:
 *
 *     SSR      <p class="a">Hello <!--$-->Ada<!--/$--></p>
 *     hydrated <p class="a">Hello AdaAda<!--/$--></p>
 *
 * `Count: 7` hydrated to `Count: 77`. The shape is any element whose LAST child
 * is an interpolation and which has any sibling before it — one of the
 * commonest things in a rendered page.
 *
 * WHY IT SURVIVED. Two independent gaps line up. The hydration parity fuzzer
 * builds its trees with `h()` and never `transformJSX`, so it reaches the
 * runtime path only and cannot see a compiled-template defect at all — a gap
 * its own record already names as owed. And on a real `@pyreon/zero` page most
 * of the body is re-mounted rather than adopted, so the broken branch rarely
 * ran where anyone would notice.
 *
 * THE FIX, and why it is a refusal rather than a repair. Nothing in the DOM or
 * in the template signature distinguishes the two slots — the signature records
 * only "this element ends with a placeholder". Normalizing the range to suit the
 * text bind is not available either: strip the markers and a genuine mount slot
 * receives a text-node placeholder, whose marker-less branch mounts a SECOND
 * copy. So the verifier refuses the one shape both can produce — a range holding
 * exactly one text node — and the element rebuilds, which is correct. An EMPTY
 * range and a range holding ELEMENTS are unambiguous and still adopt; the specs
 * below hold that line, because a bail that widened would quietly cost the
 * adoption the surrounding work exists to win.
 *
 * Restoring adoption for this shape means routing the text slot through a
 * runtime helper the way `_mountSlot` already is. That is a compiler change in
 * BOTH backends, not a verifier one, and is deliberately not attempted here.
 *
 * Every spec compiles REAL JSX through `transformJSX`, because vitest's own JSX
 * transform never emits `_tpl` and cannot reproduce any of this.
 *
 * Bisect: reverting the one-text refusal in `matchDomAgainstTemplate` fails the
 * three duplication specs with `expected '<p class="a">Hello AdaAda…'`.
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
  _setAttr,
  _setClass,
  _setStyle,
  _tpl,
  hydrateRoot,
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

async function ssrInto(vnode: unknown): Promise<HTMLElement> {
  const html = await renderToString(vnode as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
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



/** SSR the given tree, then hydrate `client` over it and return the DOM. */
async function roundTrip(tree: unknown, client: string) {
  const html = await renderToString(tree as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  const before = snapshot(host)
  const App = compileApp(client)
  const dispose = hydrateRoot(host, h(App as never, null))
  return { html, host, before, dispose, out: host.innerHTML }
}

describe('trailing reactive-text slot is not adopted as a mount slot', () => {
  it('static text then {dynamic} — renders the value ONCE', async () => {
    const { html, out, dispose } = await roundTrip(
      h('p', { class: 'a' }, 'Hello ', () => 'Ada'),
      `const App = () => { const n = signal('Ada'); return <p class="a">Hello {n()}</p> }`,
    )
    expect(html).toBe('<p class="a">Hello <!--$-->Ada<!--/$--></p>')
    expect(out).toBe('<p class="a">Hello Ada</p>')
    dispose()
  })

  it('label: {value} — the shape that hydrated to `Count: 77`', async () => {
    const { out, dispose } = await roundTrip(
      h('div', { class: 'b' }, 'Count: ', () => '7'),
      `const App = () => { const c = signal('7'); return <div class="b">Count: {c()}</div> }`,
    )
    expect(out).toBe('<div class="b">Count: 7</div>')
    dispose()
  })

  it('element then {dynamic} — a preceding ELEMENT sibling triggers it too', async () => {
    const { out, dispose } = await roundTrip(
      h('p', { class: 'c' }, h('b', null, 'B'), () => 'tail'),
      `const App = () => { const t = signal('tail'); return <p class="c"><b>B</b>{t()}</p> }`,
    )
    expect(out).toBe('<p class="c"><b>B</b>tail</p>')
    dispose()
  })

  it('stays reactive after the rebuild — the refusal must not strand the bind', async () => {
    const html = await renderToString(h('p', { class: 'r' }, 'v=', () => '1') as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const App = compileApp(
      `const App = () => { const n = signal('1'); globalThis.__n = n; return <p class="r">v={n()}</p> }`,
    )
    const dispose = hydrateRoot(host, h(App as never, null))
    expect(host.innerHTML).toBe('<p class="r">v=1</p>')
    ;(globalThis as { __n?: { set(v: string): void } }).__n?.set('2')
    expect(host.innerHTML).toBe('<p class="r">v=2</p>')
    dispose()
  })

  // ── The refusal must stay NARROW ───────────────────────────────────────────
  it('a SOLE {dynamic} child still adopts (markers elided, different path)', async () => {
    const { html, out, before, host, dispose } = await roundTrip(
      h('p', { class: 'd' }, () => 'only'),
      `const App = () => { const o = signal('only'); return <p class="d">{o()}</p> }`,
    )
    expect(html).toBe('<p class="d">only</p>')
    expect(out).toBe('<p class="d">only</p>')
    expect(retained(before, host)).toBe(before.length)
    dispose()
  })

  it('a trailing slot holding ELEMENTS still ADOPTS — unambiguous, keeps its win', async () => {
    const { out, before, host, dispose } = await roundTrip(
      h('ul', { class: 'l' }, h('li', { class: 'hd' }, 'h'), () => [h('li', null, 'a'), h('li', null, 'b')]),
      `const App = () => { const xs = signal(['a','b']); return <ul class="l"><li class="hd">h</li>{xs().map((x) => <li>{x}</li>)}</ul> }`,
    )
    expect(out).toContain('<li>a</li>')
    expect(out).toContain('<li>b</li>')
    expect(out.match(/<li>a<\/li>/g)).toHaveLength(1)
    expect(retained(before, host)).toBeGreaterThan(0)
    expect(tplAdopted()).toBeGreaterThan(0)
    dispose()
  })

  it('an all-static element is untouched', async () => {
    const { out, before, host, dispose } = await roundTrip(
      h('p', { class: 'e' }, 'plain'),
      `const App = () => <p class="e">plain</p>`,
    )
    expect(out).toBe('<p class="e">plain</p>')
    expect(retained(before, host)).toBe(before.length)
    dispose()
  })
})
