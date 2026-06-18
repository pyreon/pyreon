/**
 * Runtime contract for the compiler's element-conditional `_tpl` fast path.
 *
 * The compiler now lowers a DOM wrapper around an inline element-conditional —
 *   `<div class="card">{() => open() ? <Panel/> : <Empty/>}</div>`
 * — to `_tpl("<div class=\"card\"><!></div>", (root) => _mountSlot(() => (...), root, root.firstChild))`
 * instead of bailing the whole wrapper to the jsx runtime. The inner JSX stays
 * raw in the emitted accessor and is compiled to `h()` downstream (by esbuild).
 * This test builds that exact shape directly with `h()` (= esbuild's output for
 * the compiler's raw inner JSX), so it reproduces the emitted runtime shape
 * faithfully. (Written with `h()` rather than JSX literals because runtime-dom's
 * tsconfig uses `jsx: preserve` — the convention for browser tests in this pkg.)
 *
 * These specs lock the END-TO-END runtime behaviour of that emitted shape:
 * `_mountSlot(reactiveAccessor, parent, <!>placeholder)` → `mountChild` →
 * `mountReactive` (which creates its OWN marker before the placeholder, so
 * `_mountSlot` removing the placeholder can't strand it). Same runtime path the
 * `.map`-returning-children and element-valued-const cases already ship on.
 */
import { h } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _mountSlot, _tpl, mountChild } from '@pyreon/runtime-dom'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

describe('element-conditional `_tpl` fast path — runtime contract', () => {
  it('ternary: wrapper is one cloneNode, active branch renders, swaps reactively, old branch disposed', async () => {
    const open = signal(true)
    // The exact shape the compiler emits for
    //   <div class="card">{() => open() ? <span class="a">A</span> : <b class="b">B</b>}</div>
    const node = _tpl('<div class="card"><!></div>', (root) => {
      const d = _mountSlot(
        () => (open() ? h('span', { class: 'a' }, 'A') : h('b', { class: 'b' }, 'B')),
        root,
        root.firstChild as Node,
      )
      return () => {
        d?.()
      }
    })
    const { container, unmount } = mountInBrowser(node as unknown as VNodeChild)
    await flush()

    // wrapper templatized (the `_tpl` cloneNode), active branch = the span
    const card = container.querySelector('.card')
    expect(card).toBeTruthy()
    expect(container.querySelector('.a')?.textContent).toBe('A')
    expect(container.querySelector('.b')).toBeNull()

    // flip → other branch mounts, old branch is removed from the DOM
    open.set(false)
    await flush()
    expect(container.querySelector('.b')?.textContent).toBe('B')
    expect(container.querySelector('.a')).toBeNull()

    // the wrapper node itself is stable across the swap (patched in place)
    expect(container.querySelector('.card')).toBe(card)

    // flip back
    open.set(true)
    await flush()
    expect(container.querySelector('.a')?.textContent).toBe('A')
    expect(container.querySelector('.b')).toBeNull()

    unmount()
  })

  it('logical-and: renders when truthy, removes the element when falsy', async () => {
    const n = signal(1)
    const node = _tpl('<section><!></section>', (root) => {
      const d = _mountSlot(
        () => (n() > 0 && h('span', { class: 'list' }, 'L')),
        root,
        root.firstChild as Node,
      )
      return () => {
        d?.()
      }
    })
    const { container, unmount } = mountInBrowser(node as unknown as VNodeChild)
    await flush()
    expect(container.querySelector('.list')?.textContent).toBe('L')

    n.set(0)
    await flush()
    expect(container.querySelector('.list')).toBeNull() // && false → nothing rendered

    n.set(5)
    await flush()
    expect(container.querySelector('.list')?.textContent).toBe('L') // back

    unmount()
  })

  it('static (non-signal) element-conditional mounts once — no reactive churn', async () => {
    // Mirrors the bare (non-accessor) slot arg the compiler emits when the
    // condition has no signal read: `_mountSlot(p.cond ? <a/> : <b/>, ...)`.
    const cond = true
    const node = _tpl('<div class="wrap"><!></div>', (root) => {
      const d = _mountSlot(
        cond ? h('span', { class: 'yes' }, 'Y') : h('span', { class: 'no' }, 'N'),
        root,
        root.firstChild as Node,
      )
      return () => {
        d?.()
      }
    })
    const { container, unmount } = mountInBrowser(node as unknown as VNodeChild)
    await flush()
    expect(container.querySelector('.wrap .yes')?.textContent).toBe('Y')
    expect(container.querySelector('.no')).toBeNull()
    unmount()
  })

  it('PERF: the wrapper is a cloneNode template, not slower than the h() wrapper (logs the figure)', () => {
    // A/B over the WRAPPER only — both paths mount the same conditional accessor
    // (identical inner cost), so the delta isolates wrapper creation:
    //   NEW: `_tpl("<div class=\"card\"><!></div>", _mountSlot(accessor))` (cloneNode)
    //   OLD: `h("div", { class: "card" }, accessor)`              (createElement + setAttribute)
    const N = 400
    const RUNS = 5
    const mk = (build: () => unknown) => {
      const times: number[] = []
      for (let r = 0; r < RUNS; r++) {
        const c = document.createElement('div')
        document.body.appendChild(c)
        const t0 = performance.now()
        for (let i = 0; i < N; i++) mountChild(build() as VNodeChild, c)
        times.push(performance.now() - t0)
        c.remove()
      }
      times.sort((a, b) => a - b)
      return times[Math.floor(times.length / 2)] ?? 0 // median (RUNS > 0)
    }
    const sig = signal(true)
    const accessor = () => (sig() ? h('span', { class: 'a' }, 'A') : h('b', { class: 'b' }, 'B'))
    const newMs = mk(() =>
      _tpl('<div class="card"><!></div>', (root) => {
        const d = _mountSlot(accessor, root, root.firstChild as Node)
        return () => {
          d?.()
        }
      }),
    )
    const oldMs = mk(() => h('div', { class: 'card' }, accessor))
    // eslint-disable-next-line no-console
    console.log(
      `[element-conditional perf] ${N} wrappers × ${RUNS} runs (median): _tpl=${newMs.toFixed(2)}ms  h()=${oldMs.toFixed(2)}ms  (ratio ${(oldMs / newMs).toFixed(2)}×)`,
    )
    // Direction-only, deliberately loose so CI load can't flake it: the cloneNode
    // wrapper must not be pathologically slower than the createElement wrapper.
    expect(newMs).toBeLessThan(oldMs * 2)
  })
})
