/**
 * Hydration half of the single-evaluation contract (mount half:
 * `accessor-single-run-at-mount.test.tsx`). The hydration walk needs a reactive
 * accessor's initial value to pick a path; it used to sample it untracked and
 * then let the adopting binding call the accessor again (three times on the
 * reactive-text path). Every spec here renders with the REAL compiler on the
 * server, hydrates the real output, counts accessor evaluations, and checks the
 * hydrated binding is still live (and its effects / cleanups owned by it).
 */
import { transformJSX } from '@pyreon/compiler'
import { _fuse, _lc, For, Fragment, h } from '@pyreon/core'
import { _bind, effect, onCleanup, renderEffect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _applyProps, _bindDirect, _bindProp, _bindText, _mountChild, _mountSlot, _setAttr, _setChild, _setChildAt,
  _setClass, _setStyle, _textSlot, _tpl, hydrateRoot,
} from '../index'
import { disableHydrationWarnings } from '../hydration-debug'
import { bindPolymorphicText } from '../mount'

const DEPS: Record<string, unknown> = {
  _tpl, _bind, renderEffect, _bindText, _bindProp, _bindDirect, _applyProps, _setStyle, _setAttr, _setClass,
  _mountSlot, _textSlot, _setChild, _setChildAt, _mountChild, _fuse, _lc, bindPolymorphicText, h, Fragment, For,
}
function build(source: string, globals: Record<string, unknown>, ssr: boolean): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', ssr ? { ssr: true } : {})
  for (const m of code.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["']@pyreon\/(?:core|runtime-dom|reactivity)["']/gm))
    for (const raw of (m[1] ?? '').split(',')) {
      const n = raw.trim().split(/\s+as\s+/).pop()?.trim()
      if (n && !(n in DEPS)) throw new Error(`[harness] add ${n} to DEPS`)
    }
  const body = transformSync(code.replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, ''), {
    loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment',
  }).code
  const names = [...Object.keys(DEPS), ...Object.keys(globals)]
  return new Function(...names, `${body}\nreturn App`)(...Object.values(DEPS), ...Object.values(globals)) as () => unknown
}

let host: HTMLElement | null = null
afterEach(() => {
  host?.remove()
  host = null
})

/** SSR with the server build, then hydrate the client build over it. Returns calls made DURING hydration. */
async function ssrThenHydrate(source: string, S: Record<string, unknown> & { calls: number }) {
  // The server render runs the accessor too; give it inert effect / cleanup
  // hooks so nothing it creates outlives the render in this shared process.
  const server = { ...S, effect: () => {}, onCleanup: () => {} }
  const html = await renderToString(h(build(source, { S: server }, true) as never, null))
  host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  S.calls = 0
  const restore = disableHydrationWarnings()
  const dispose = hydrateRoot(host, h(build(source, { S }, false) as never, null))
  restore?.()
  return { host, dispose, hydrateCalls: S.calls as number }
}

describe('hydration evaluates a reactive accessor ONCE', () => {
  it('range-marked VNode accessor (beside siblings): 1 call, then live', async () => {
    const S = { calls: 0, on: signal(true) }
    const src = `const App = () => <div><span>a</span>{() => { S.calls++; return S.on() ? <b>on</b> : <i>off</i> }}</div>`
    const r = await ssrThenHydrate(src, S)
    expect(r.hydrateCalls).toBe(1)
    expect(r.host.querySelector('b')?.textContent).toBe('on')
    S.on.set(false)
    expect(r.host.querySelector('b')).toBeNull()
    expect(r.host.querySelector('i')?.textContent).toBe('off')
    r.dispose()
  })

  it('sole accessor child producing a keyed .map: 1 call, keyed list reused on update', async () => {
    const S = { calls: 0, items: signal([1, 2, 3]) }
    const src = `const App = () => <ul>{() => { S.calls++; return S.items().map((i) => <li key={i}>{i}</li>) }}</ul>`
    const r = await ssrThenHydrate(src, S)
    expect(r.hydrateCalls).toBe(1)
    const li1 = r.host.querySelectorAll('li')[0]
    S.items.set([1, 2, 3, 4])
    expect(r.host.querySelectorAll('li')).toHaveLength(4)
    expect(r.host.querySelectorAll('li')[0]).toBe(li1)
    r.dispose()
  })

  it('compiled reactive text between elements (_tpl adoption path): 1 call, updated in place', async () => {
    const S = { calls: 0, n: signal(1) }
    const src = `const App = () => <p><b>x</b>{() => { S.calls++; return S.n() }}<i>y</i></p>`
    const r = await ssrThenHydrate(src, S)
    expect(r.hydrateCalls).toBe(1)
    expect(r.host.querySelector('p')?.textContent).toBe('x1y')
    S.n.set(2)
    expect(r.host.querySelector('p')?.textContent).toBe('x2y')
    r.dispose()
  })

  it('effects and cleanups created by the single call belong to the hydrated binding', async () => {
    const S = { calls: 0, on: signal(true), tick: signal(0), fires: 0, log: [] as string[], effect, onCleanup }
    const src = `const App = () => <div><span>a</span>{() => {
      S.calls++
      const on = S.on()
      S.effect(() => { S.tick(); S.fires++ })
      S.onCleanup(() => S.log.push('cleanup ' + on))
      return on ? <b>on</b> : <i>off</i>
    }}</div>`
    const r = await ssrThenHydrate(src, S)
    expect(r.hydrateCalls).toBe(1)
    S.fires = 0
    S.tick.set(1)
    expect(S.fires).toBe(1) // one live inner effect, not two
    S.on.set(false) // re-run: previous cleanup runs, previous inner effect disposed
    expect(S.log).toEqual(['cleanup true'])
    S.fires = 0
    S.tick.set(2)
    expect(S.fires).toBe(1)
    r.dispose()
    expect(S.log).toEqual(['cleanup true', 'cleanup false'])
  })

  it('h() reactive text between elements (hydrateReactiveText): 1 call, adopted node updated', async () => {
    let calls = 0
    const n = signal(1)
    const view = () =>
      h('p', null, h('b', null, 'x'), () => {
        calls++
        return n()
      }, h('i', null, 'y'))
    const html = await renderToString(h(view, null))
    host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    calls = 0
    const restore = disableHydrationWarnings()
    const dispose = hydrateRoot(host, h(view, null))
    restore?.()
    expect(calls).toBe(1)
    const text = [...host.querySelector('p')!.childNodes].find((c) => c.nodeType === 3 && c.textContent === '1')
    expect(text).toBeDefined()
    n.set(2)
    expect(host.querySelector('p')!.textContent).toBe('x2y')
    expect(text!.textContent).toBe('2')
    dispose()
  })
})
