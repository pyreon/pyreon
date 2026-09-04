/**
 * Regression lock — COMPILED-template hydration adoption (`_tpl` adopt).
 *
 * Compiled apps' `<For>` rows are NativeItems (`_tpl` clone + bind). Before
 * this feature, hydration SWAPPED every compiled row (fresh subtree replaces
 * the SSR row — the hydrate.ts NativeItem branch), which (a) threw away the
 * server DOM and (b) left the ForEntry anchor pointing at the DETACHED
 * original node — corrupting every later move/removal of that entry.
 *
 * Now the For adoption path arms a one-shot target before renderItem; the
 * `_tpl` call inside verifies the SSR row against the template (tag +
 * TAG:textCount signature + `$`-triplet validation, all BEFORE any mutation)
 * and runs its compiled bind against the EXISTING nodes. Any bail falls back
 * to the swap — whose anchor bookkeeping is now also fixed (re-resolved from
 * the row's k: marker).
 *
 * Every spec compiles REAL JSX through `transformJSX` (the actual client
 * emit — `_tpl` + ref walks), hydrates over REAL `renderToString` output.
 *
 * Bisect: neutering the `_tpl` adopt branch (never consume the target) fails
 * the `tpl.adopt` counter + node-identity specs; the bail-shape spec still
 * passes (swap fallback IS the old behavior + the anchor fix). Reverting the
 * anchor fix fails the bail-shape spec's post-hydration list ops.
 */
import { transformSync } from 'esbuild'
import { transformJSX } from '@pyreon/compiler'
import { For, Fragment, h } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
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

function stripImports(code: string): string {
  return code.replace(/^import[^\n]*\n/gm, '')
}

/** The Pyreon transform leaves COMPONENT JSX (e.g. `<For>`) for the app's
 * downstream jsx pass — lower it to h() so `new Function` can evaluate. */
function lowerResidualJsx(code: string): string {
  return transformSync(code, {
    loader: 'jsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
}

function compileApp(source: string, globals: Record<string, unknown>): () => unknown {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(stripImports(code).replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

interface Row {
  id: number
  label: ReturnType<typeof signal<string>>
}
const mk = (ids: number[]): Row[] => ids.map((id) => ({ id, label: signal(`L${id}`) }))

/** h()-built twin of the compiled row app — the SSR side (what the server
 * renders; markers: k: per row + $ triplets per accessor text). */
const ssrApp = (rows: () => Row[], sel: (id: number) => boolean) =>
  h(
    'div',
    null,
    h(For, {
      each: () => rows(),
      by: (r: Row) => r.id,
      children: (r: Row) =>
        h(
          'section',
          { class: () => (sel(r.id) ? 'on' : '') },
          h('b', null, () => String(r.id)),
          h('a', null, () => r.label()),
        ),
    }),
  )

const COMPILED_APP_SRC = `
const App = () => (
  <div>
    <For each={() => rows()} by={(r) => r.id}>
      {(r) => (
        <section class={() => (sel(r.id) ? 'on' : '')}>
          <b>{() => String(r.id)}</b>
          <a>{() => r.label()}</a>
        </section>
      )}
    </For>
  </div>
)`

async function ssrInto(rows: Row[]): Promise<HTMLElement> {
  const html = await renderToString(
    ssrApp(
      () => rows,
      () => false,
    ),
  )
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

describe('compiled-template hydration adoption', () => {
  it('ADOPTS SSR rows into compiled _tpl binds — node identity + tpl.adopt counter', async () => {
    const host = await ssrInto(mk([1, 2, 3]))
    const before = Array.from(host.querySelectorAll('section'))
    expect(before).toHaveLength(3)

    const rows = signal(mk([1, 2, 3]))
    const App = compileApp(COMPILED_APP_SRC, { rows: () => rows(), sel: () => false })
    const dispose = hydrateRoot(host, h(App as never, null))

    const after = Array.from(host.querySelectorAll('section'))
    expect(after).toHaveLength(3)
    for (let i = 0; i < 3; i++) expect(after[i]).toBe(before[i]) // ADOPTED, not swapped
    expect(tplAdopted()).toBe(3)
    dispose()
  })

  it('adopted compiled rows are REACTIVE (label flip patches the SSR text node in place)', async () => {
    const host = await ssrInto(mk([1, 2]))
    const rows = signal(mk([1, 2]))
    const App = compileApp(COMPILED_APP_SRC, { rows: () => rows(), sel: () => false })
    const dispose = hydrateRoot(host, h(App as never, null))
    expect(tplAdopted()).toBe(2)

    const aBefore = host.querySelectorAll('a')[0]!
    const textNode = aBefore.firstChild
    rows()[0]!.label.set('CHANGED')
    expect(aBefore.textContent).toBe('CHANGED')
    expect(aBefore.firstChild).toBe(textNode) // patched IN PLACE — same text node
    dispose()
  })

  it('post-hydration list ops work on adopted compiled entries (append/remove/reorder)', async () => {
    const host = await ssrInto(mk([1, 2, 3]))
    const rows = signal(mk([1, 2, 3]))
    const App = compileApp(COMPILED_APP_SRC, { rows: () => rows(), sel: () => false })
    const dispose = hydrateRoot(host, h(App as never, null))
    expect(tplAdopted()).toBe(3)
    const labels = () => Array.from(host.querySelectorAll('a')).map((a) => a.textContent)

    rows.set([...rows(), ...mk([4])])
    expect(labels()).toEqual(['L1', 'L2', 'L3', 'L4'])
    const shrunk = [...rows()]
    shrunk.splice(1, 1)
    rows.set(shrunk)
    expect(labels()).toEqual(['L1', 'L3', 'L4'])
    rows.set([...rows()].reverse())
    expect(labels()).toEqual(['L4', 'L3', 'L1'])
    dispose()
  })

  it('SWAP fallback (adoption-bail shape) keeps LIVE anchors — list ops after a swapped hydration', async () => {
    // A row with a conditional slot compiles to a template containing a `<!>`
    // placeholder — templateSignature refuses it, so every row takes the
    // interpretive NativeItem SWAP. Before the anchor fix, each ForEntry then
    // pointed at its DETACHED SSR node and every later op corrupted the list.
    const BAIL_SRC = `
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
)`
    const ssrBail = (rows: () => Row[]) =>
      h(
        'div',
        null,
        h(For, {
          each: () => rows(),
          by: (r: Row) => r.id,
          children: (r: Row) =>
            h('section', null, () => null, h('a', null, () => r.label())),
        }),
      )
    const srvRows = mk([1, 2, 3])
    const html = await renderToString(ssrBail(() => srvRows))
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)

    const rows = signal(mk([1, 2, 3]))
    const App = compileApp(BAIL_SRC, { rows: () => rows(), cond: () => false })
    const dispose = hydrateRoot(host, h(App as never, null))
    expect(tplAdopted()).toBe(0) // adoption bailed — swap path
    const labels = () => Array.from(host.querySelectorAll('a')).map((a) => a.textContent)
    expect(labels()).toEqual(['L1', 'L2', 'L3'])

    // The load-bearing part: list ops after a SWAPPED hydration. With the old
    // detached-anchor bookkeeping these corrupt (dead-node moves/removals).
    const shrunk = [...rows()]
    shrunk.splice(1, 1)
    rows.set(shrunk)
    expect(labels()).toEqual(['L1', 'L3'])
    rows.set([...rows()].reverse())
    expect(labels()).toEqual(['L3', 'L1'])
    rows.set([...rows(), ...mk([9])])
    expect(labels()).toEqual(['L3', 'L1', 'L9'])
    dispose()
  })
})
