/**
 * Regression lock — a mid slot whose server range holds ELEMENTS is PARKED and
 * ADOPTED instead of rebuilding the element's subtree.
 *
 * `{cond && <i/>}!`, `{xs.map(…)} tail` — a placeholder with static content
 * after it whose range is not one text node. Such a range cannot be collapsed
 * to the clone's single node without losing its elements, and the compiled
 * refs after it still need that single-node shape. So the verifier PARKS the
 * range: everything after the open marker through the close marker moves into
 * a fragment hung off the open marker, which stays as the placeholder. The
 * verify descent steps over the parked range (its content is slot output the
 * template says nothing about); `hydrateMountSlot` puts the range back and
 * adopts it; `_textSlot` — a text bind that finds element content where it
 * expected a text — discards it and takes a fresh node, WITHOUT walking the DOM
 * for a close marker that is no longer there.
 *
 * Every spec compiles REAL JSX through `transformJSX`.
 *
 * Bisect: reverting the park branch in `matchDomAgainstTemplate` fails every
 * ADOPT spec on retention (`expected 0 to be N`) while the DOM assertions
 * still pass — the rebuild is correct, just not an adoption.
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



const noC = (x: string) => x.replace(/<!--[^>]*-->/g, '')
const flag = (name: string, v: boolean) =>
  (globalThis as unknown as Record<string, { set(v: boolean): void } | undefined>)[name]?.set(v)

describe('mid ELEMENT slot — parked, put back, adopted', () => {
  it('`{on() && <i/>}!` adopts every node — the <i> keeps its identity, and flips still work', async () => {
    const { html, out, before, host, dispose } = await roundTrip(
      h('p', { class: 'e1' }, () => h('i', null, 'i'), '!'),
      `const App = () => { const on = signal(true); globalThis.__e1 = on; return <p class="e1">{on() && <i>i</i>}!</p> }`,
    )
    expect(html).toBe('<p class="e1"><!--$--><i>i</i><!--/$-->!</p>')
    expect(noC(out)).toBe('<p class="e1"><i>i</i>!</p>')
    expect(retained(before, host)).toBe(before.length)
    expect(tplAdopted()).toBe(1)
    const i = host.querySelector('i')!
    expect(before).toContain(i)
    flag('__e1', false)
    expect(noC(host.innerHTML)).toBe('<p class="e1">!</p>')
    flag('__e1', true)
    expect(noC(host.innerHTML)).toBe('<p class="e1"><i>i</i>!</p>')
    expect(host.innerHTML.match(/<i>i<\/i>/g)).toHaveLength(1)
    dispose()
  })

  it('a mid `.map()` list followed by static text adopts every row', async () => {
    const { out, before, host, dispose } = await roundTrip(
      h('div', { class: 'e2' }, () => [h('b', null, 'a'), h('b', null, 'b')], ' tail'),
      `const App = () => { const xs = signal(['a','b']); globalThis.__xs = xs; return <div class="e2">{xs().map((x) => <b>{x}</b>)} tail</div> }`,
    )
    expect(noC(out)).toBe('<div class="e2"><b>a</b><b>b</b> tail</div>')
    expect(retained(before, host)).toBe(before.length)
    ;(globalThis as unknown as Record<string, { set(v: string[]): void } | undefined>).__xs?.set(['a', 'b', 'c'])
    expect(noC(host.innerHTML)).toBe('<div class="e2"><b>a</b><b>b</b><b>c</b> tail</div>')
    dispose()
  })

  it('two mid element ranges with static text between — both parked, refs between them correct', async () => {
    const { out, before, host, dispose } = await roundTrip(
      h('p', { class: 'e3' }, () => h('i', null, '1'), ' and ', () => h('i', null, '2'), '.'),
      `const App = () => { const a = signal(true); const b = signal(true); globalThis.__a3 = a; globalThis.__b3 = b; return <p class="e3">{a() && <i>1</i>} and {b() && <i>2</i>}.</p> }`,
    )
    expect(noC(out)).toBe('<p class="e3"><i>1</i> and <i>2</i>.</p>')
    expect(retained(before, host)).toBe(before.length)
    flag('__b3', false)
    expect(noC(host.innerHTML)).toBe('<p class="e3"><i>1</i> and .</p>')
    dispose()
  })

  it('a parked element range and a collapsed text slot in ONE element', async () => {
    const { out, before, host, dispose } = await roundTrip(
      h('p', { class: 'e4' }, () => h('i', null, 'i'), ' ', () => 'Ada', '!'),
      `const App = () => { const on = signal(true); const n = signal('Ada'); globalThis.__n4 = n; return <p class="e4">{on() && <i>i</i>} {n()}!</p> }`,
    )
    expect(noC(out)).toBe('<p class="e4"><i>i</i> Ada!</p>')
    expect(retained(before, host)).toBe(before.length)
    ;(globalThis as unknown as Record<string, { set(v: string): void } | undefined>).__n4?.set('Bob')
    expect(noC(host.innerHTML)).toBe('<p class="e4"><i>i</i> Bob!</p>')
    dispose()
  })

  it('a signal call inside the parked element — `{on() && <b>x{y()}</b>}!` — adopts (the inner value is STATIC on both sides)', async () => {
    // FAITHFUL server arm: the compiler leaves the conditional's <b> as residual
    // JSX with a BARE `{y()}`, so both the SSR emit and the client lower it to a
    // plain VALUE child — no inner markers. Reactivity lives at the conditional:
    // `_mountSlot`'s accessor re-runs on `y` and re-creates the <b> (verified
    // by a client-only mount: xy → xZ). A hand-built `() => 'y'` inner accessor
    // here would be a document the server never sends.
    const { html, out, before, host, dispose } = await roundTrip(
      h('p', { class: 'e5' }, () => h('b', null, 'x', 'y'), '!'),
      `const App = () => { const on = signal(true); const y = signal('y'); globalThis.__y5 = y; return <p class="e5">{on() && <b>x{y()}</b>}!</p> }`,
    )
    expect(html).toBe('<p class="e5"><!--$--><b>xy</b><!--/$-->!</p>')
    expect(noC(out)).toBe('<p class="e5"><b>xy</b>!</p>')
    expect(retained(before, host)).toBe(before.length)
    ;(globalThis as unknown as Record<string, { set(v: string): void } | undefined>).__y5?.set('Z')
    expect(noC(host.innerHTML)).toBe('<p class="e5"><b>xZ</b>!</p>')
    dispose()
  })

  it('a genuinely NESTED reactive range inside the parked element (explicit inner accessor) adopts as one unit', async () => {
    // `{() => y()}` survives residual lowering as an accessor child, so the
    // server marks the inner range: the park must carry `<!--$-->` pairs at
    // depth, and `findMatchingClose` must not stop at the INNER close.
    const { html, out, before, host, dispose } = await roundTrip(
      h('p', { class: 'e5b' }, () => h('b', null, 'x', () => 'y'), '!'),
      `const App = () => { const on = signal(true); const y = signal('y'); globalThis.__y5b = y; return <p class="e5b">{on() && <b>x{() => y()}</b>}!</p> }`,
    )
    expect(html).toBe('<p class="e5b"><!--$--><b>x<!--$-->y<!--/$--></b><!--/$-->!</p>')
    expect(noC(out)).toBe('<p class="e5b"><b>xy</b>!</p>')
    expect(retained(before, host)).toBe(before.length)
    ;(globalThis as unknown as Record<string, { set(v: string): void } | undefined>).__y5b?.set('Z')
    expect(noC(host.innerHTML)).toBe('<p class="e5b"><b>xZ</b>!</p>')
    dispose()
  })
})

describe('mid ELEMENT slot — the hazard cases', () => {
  it('a TEXT bind whose range holds an element (polymorphic upgrade) discards the park and keeps its static sibling', async () => {
    // The hazard: `_textSlot` receiving a parked range must NOT walk the DOM for
    // a close marker that is inside the fragment — that walk would remove the
    // static sibling. It discards the park and takes a fresh node; the bind
    // then mounts its VNode value into it.
    const { out, host, dispose } = await roundTrip(
      h('p', { class: 'e6' }, () => h('b', null, 'x'), '!'),
      `const App = () => { const v = signal(h('b', null, 'x')); return <p class="e6">{v()}!</p> }`,
    )
    expect(noC(out)).toBe('<p class="e6"><b>x</b>!</p>')
    expect(out.match(/<b>x<\/b>/g)).toHaveLength(1)
    expect(host.textContent).toBe('x!')
    dispose()
  })

  it('a mid range with NO matching close bails to a correct rebuild', async () => {
    const html = '<p class="e7"><!--$--><i>i</i>!</p>'
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const before = snapshot(host)
    const App = compileApp(`const App = () => { const on = signal(true); return <p class="e7">{on() && <i>i</i>}!</p> }`)
    const dispose = hydrateRoot(host, h(App as never, null))
    expect(noC(host.innerHTML)).toBe('<p class="e7"><i>i</i>!</p>')
    expect(host.innerHTML.match(/<i>i<\/i>/g)).toHaveLength(1)
    expect(retained(before, host)).toBeLessThan(before.length)
    dispose()
  })
})

describe('mid ELEMENT slot inside a `<For>` row', () => {
  it('rows adopt their parked ranges, and list ops after hydration stay correct', async () => {
    type Row = { id: number; label: { (): string } }
    const mk = (ids: number[]): Row[] => ids.map((id) => ({ id, label: signal('L' + id) }))
    const srvRows = mk([1, 2, 3])
    const html = await renderToString(
      h('div', null, h(For as never, {
        each: () => srvRows, by: (r: Row) => r.id,
        children: (r: Row) => h('section', null, () => h('i', null, 'x'), h('a', null, () => r.label())),
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
)`, { rows: () => rows(), cond: () => true })
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
    expect(host.querySelectorAll('i')).toHaveLength(3)
    dispose()
  })
})
