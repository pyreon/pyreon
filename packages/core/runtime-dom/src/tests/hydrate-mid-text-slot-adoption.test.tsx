/**
 * Regression lock — a NON-trailing reactive-text slot ADOPTS its SSR text.
 *
 * `<p>Hello {n()}!</p>` compiles to `<p>Hello <!>!</p>` and the placeholder is
 * followed by static content. `templateSignature` refused that shape outright
 * (the "alignment gate"): a `<!>` is ONE node in the clone and a
 * `<!--$-->…<!--/$-->` RANGE in the server DOM, so a compiled ref stepping past
 * it — `__p1 = __p0.nextSibling.nextSibling` — lands on range content. The
 * element and its whole subtree rebuilt. A 19-shape adoption census found this
 * the ONLY ordinary shape still rebuilding: every prose sentence with an
 * interpolation that is not at the very end.
 *
 * THE FIX makes the server DOM match the clone before the bind runs, instead of
 * relaxing the refs. The signature records each mid `<!>` by clone child-index;
 * the verifier requires the range at that index to hold at most ONE text node
 * and records it; `tplAdoptVerify` COLLAPSES it to exactly one text node — both
 * markers removed, an empty text materialized if the accessor rendered ''.
 * Every positional ref is then correct by construction, and BOTH bind kinds are
 * already correct on a clone-shaped DOM: `_textSlot` adopts a text placeholder,
 * `_mountSlot` treats one as inert. A range holding ELEMENTS still bails,
 * exactly as before — the specs below hold that line.
 *
 * Every spec compiles REAL JSX through `transformJSX`; vitest's own JSX
 * transform never emits `_tpl` and cannot reproduce any of this.
 *
 * Bisect: reverting the verifier's mid-slot branch fails every ADOPT spec with
 * retention `expected 0 to be N` while the DOM-equality assertions still pass
 * (the rebuild is correct, just not an adoption) — which is the point: without
 * the retention assertions this lock would be inert.
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
  _bindProp,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
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
  _bindProp,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _setClass,
  _mountSlot,
  _textSlot,
  _setChild,
  _setChildAt,
  _mountChild,
  _setHtml,
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


const set = (name: string, v: string) =>
  (globalThis as unknown as Record<string, { set(v: string): void } | undefined>)[name]?.set(v)

describe('mid text slot — static content AFTER the interpolation', () => {
  it('`Hello {n()}!` adopts every node and stays reactive on the SAME text node', async () => {
    const { html, out, before, host, dispose } = await roundTrip(
      h('p', { class: 'm' }, 'Hello ', () => 'Ada', '!'),
      `const App = () => { const n = signal('Ada'); globalThis.__m1 = n; return <p class="m">Hello {n()}!</p> }`,
    )
    expect(html).toBe('<p class="m">Hello <!--$-->Ada<!--/$-->!</p>')
    expect(out).toBe('<p class="m">Hello Ada!</p>')
    expect(retained(before, host)).toBe(before.length)
    expect(tplAdopted()).toBe(1)
    const adopted = host.firstChild!.childNodes[1] as Text
    expect(before).toContain(adopted)
    set('__m1', 'Bob')
    expect(host.innerHTML).toBe('<p class="m">Hello Bob!</p>')
    expect(host.firstChild!.childNodes[1]).toBe(adopted) // identity, not a swap
    dispose()
  })

  it('`{n()}<b>!</b>` — an ELEMENT after the slot is walked to correctly', async () => {
    const { out, before, host, dispose } = await roundTrip(
      h('p', { class: 'm3' }, () => 'Ada', h('b', null, '!')),
      `const App = () => { const n = signal('Ada'); globalThis.__m2 = n; return <p class="m3">{n()}<b>!</b></p> }`,
    )
    expect(out).toBe('<p class="m3">Ada<b>!</b></p>')
    expect(retained(before, host)).toBe(before.length)
    set('__m2', 'Cy')
    expect(host.innerHTML).toBe('<p class="m3">Cy<b>!</b></p>')
    dispose()
  })

  it('two slots — a MID slot composes with the TRAILING `_textSlot` path', async () => {
    const { html, out, before, host, dispose } = await roundTrip(
      h('p', { class: 't' }, () => 'A', ' and ', () => 'B'),
      `const App = () => { const a = signal('A'); const b = signal('B'); globalThis.__ta = a; globalThis.__tb = b; return <p class="t">{a()} and {b()}</p> }`,
    )
    expect(html).toBe('<p class="t"><!--$-->A<!--/$--> and <!--$-->B<!--/$--></p>')
    expect(out).toBe('<p class="t">A and B</p>')
    expect(retained(before, host)).toBe(before.length)
    set('__ta', 'X'); set('__tb', 'Y')
    expect(host.innerHTML).toBe('<p class="t">X and Y</p>')
    dispose()
  })

  it('an EMPTY mid range collapses to an empty text node and adopts the element', async () => {
    const { html, out, before, host, dispose } = await roundTrip(
      h('p', { class: 'e' }, 'Hello ', () => '', '!'),
      `const App = () => { const e = signal(''); globalThis.__e = e; return <p class="e">Hello {e()}!</p> }`,
    )
    expect(html).toBe('<p class="e">Hello <!--$--><!--/$-->!</p>')
    expect(out).toBe('<p class="e">Hello !</p>')
    expect(retained(before, host)).toBe(before.length)
    set('__e', 'x')
    expect(host.innerHTML).toBe('<p class="e">Hello x!</p>')
    dispose()
  })
})

describe('mid slot — the refusal stays exactly as narrow as it must', () => {
  it('a mid MOUNT slot whose range holds an ELEMENT now ADOPTS (parked) — correct, no duplication', async () => {
    const { out, host, before, dispose } = await roundTrip(
      h('p', { class: 'mo' }, () => h('i', null, 'i'), '!'),
      `const App = () => { const on = signal(true); globalThis.__on = on; return <p class="mo">{on() && <i>i</i>}!</p> }`,
    )
    const noC = (x: string) => x.replace(/<!--[^>]*-->/g, '')
    expect(noC(out)).toBe('<p class="mo"><i>i</i>!</p>')
    expect(out.match(/<i>i<\/i>/g)).toHaveLength(1)
    expect(retained(before, host)).toBe(before.length) // parked, put back, adopted
    ;(globalThis as unknown as Record<string, { set(v: boolean): void } | undefined>).__on?.set(false)
    expect(noC(host.innerHTML)).toBe('<p class="mo">!</p>')
    dispose()
  })

  it('a mid MOUNT slot whose range is EMPTY collapses safely — `_mountSlot` treats the text as inert', async () => {
    const { html, out, host, dispose } = await roundTrip(
      h('p', { class: 'mf' }, () => false, '!'),
      `const App = () => { const on = signal(false); globalThis.__on2 = on; return <p class="mf">{on() && <i>i</i>}!</p> }`,
    )
    expect(html).toBe('<p class="mf"><!--$--><!--/$-->!</p>')
    expect(out.replace(/<!--[^>]*-->/g, '')).toBe('<p class="mf">!</p>')
    ;(globalThis as unknown as Record<string, { set(v: boolean): void } | undefined>).__on2?.set(true)
    expect(host.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<p class="mf"><i>i</i>!</p>')
    expect(host.innerHTML.match(/<i>i<\/i>/g)).toHaveLength(1)
    ;(globalThis as unknown as Record<string, { set(v: boolean): void } | undefined>).__on2?.set(false)
    expect(host.innerHTML.replace(/<!--[^>]*-->/g, '')).toBe('<p class="mf">!</p>')
    dispose()
  })

  it('server rendered FEWER ranges than the template has placeholders — bails to a correct rebuild', async () => {
    const { out, before, host, dispose } = await roundTrip(
      h('p', { class: 'd1' }, 'Hello ', '!'),
      `const App = () => { const n = signal('Ada'); return <p class="d1">Hello {n()}!</p> }`,
    )
    expect(out).toBe('<p class="d1">Hello Ada!</p>')
    expect(retained(before, host)).toBeLessThan(before.length)
    dispose()
  })

  it('server rendered a range where the template has NO placeholder — bails to a correct rebuild', async () => {
    const { out, before, host, dispose } = await roundTrip(
      h('p', { class: 'd2' }, 'Hello ', () => 'Ada', '!'),
      `const App = () => <p class="d2">Hello !</p>`,
    )
    expect(out).toBe('<p class="d2">Hello !</p>')
    expect(retained(before, host)).toBeLessThan(before.length)
    dispose()
  })
})

describe('mid slot inside a `<For>` row — adopts via the full verify, never the plan replay', () => {
  it('an EMPTY mid MOUNT slot before a static sibling — rows ADOPT, and list ops after hydration stay correct', async () => {
    // The shape `hydrate-tpl-adoption.test.tsx`'s SWAP-fallback spec used to
    // carry: templateSignature refused it, so every row swapped. It now adopts
    // (empty range → collapsed to a branded empty text `_mountSlot` treats as
    // inert), so the live-anchor invariant that spec locks for the swap path
    // must hold for the adopt path too — same three list ops.
    type Row = { id: number; label: { (): string } }
    const mk = (ids: number[]): Row[] => ids.map((id) => ({ id, label: signal('L' + id) }))
    const srvRows = mk([1, 2, 3])
    const html = await renderToString(
      h('div', null, h(For as never, {
        each: () => srvRows, by: (r: Row) => r.id,
        children: (r: Row) => h('section', null, () => null, h('a', null, () => r.label())),
      } as never)) as never,
    )
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const before = snapshot(host)
    const rows = signal(mk([1, 2, 3]))
    const App = compileApp(`
const App = () => (
  <div>
    <For each={() => rows()} by={(r) => r.id}>
      {(r) => (
        <section>
          {cond() ? <i>x</i> : null}
          <a>{() => r.label()}</a>
        </section>
      )}
    </For>
  </div>
)`, { rows: () => rows(), cond: () => false })
    const dispose = hydrateRoot(host, h(App as never, null))
    expect(tplAdopted()).toBe(3)
    expect(retained(before, host)).toBe(before.length)
    const labels = () => Array.from(host.querySelectorAll('a')).map((a) => a.textContent)
    expect(labels()).toEqual(['L1', 'L2', 'L3'])
    rows.set([...rows(), ...mk([4])])
    expect(labels()).toEqual(['L1', 'L2', 'L3', 'L4'])
    const shrunk = [...rows()]
    shrunk.splice(1, 1)
    rows.set(shrunk)
    expect(labels()).toEqual(['L1', 'L3', 'L4'])
    rows.set([...rows()].reverse())
    expect(labels()).toEqual(['L4', 'L3', 'L1'])
    expect(host.innerHTML.match(/<i>x<\/i>/g)).toBeNull()
    dispose()
  })

  it('every row keeps its nodes and no plan replay fires', async () => {
    const rows = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 3, n: 'c' }]
    const server = h(
      'ul',
      { class: 'rows' },
      h(For as never, { each: rows, by: (r: { id: number }) => r.id, children: (r: { n: string }) => h('li', { class: 'r' }, 'Item ', () => r.n, '!') } as never),
    )
    const html = await renderToString(server as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const before = snapshot(host)
    const App = compileApp(
      `const App = () => <ul class="rows"><For each={rows} by={(r) => r.id}>{(r) => <li class="r">Item {r.n}!</li>}</For></ul>`,
      { rows },
    )
    const dispose = hydrateRoot(host, h(App as never, null))
    const text = host.innerHTML.replace(/<!--[^>]*-->/g, '')
    expect(text).toBe('<ul class="rows"><li class="r">Item a!</li><li class="r">Item b!</li><li class="r">Item c!</li></ul>')
    expect(retained(before, host)).toBe(before.length)
    expect(counts['runtime.tpl.adoptPlanReplay'] ?? 0).toBe(0)
    expect((counts['runtime.tpl.adopt'] ?? 0) + (counts['runtime.mountFor.hydrateAdopt'] ?? 0)).toBeGreaterThan(0)
    dispose()
  })
})
