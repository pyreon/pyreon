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
import { _mountSlot, _tpl } from '@pyreon/runtime-dom'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'

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

  it('reuses the parsed template, clones each wrapper once and disposes every subscription', async ({ onTestFinished }) => {
    const template = '<div class="clone-contract"><!></div>'
    const open = signal(true)
    let reads = 0
    const build = () =>
      _tpl(template, (root) =>
        _mountSlot(
          () => {
            reads++
            return open() ? h('span', { class: 'a' }, 'A') : h('b', { class: 'b' }, 'B')
          },
          root,
          root.firstChild as Node,
        ),
      )

    // Parse once, then measure the work the fast path promises, independent of
    // runner load and engine timing resolution. Dispose the warmup as well.
    const warmup = mountInBrowser(build() as unknown as VNodeChild)
    warmup.unmount()
    const clone = vi.spyOn(Node.prototype, 'cloneNode')
    const create = vi.spyOn(document, 'createElement')
    const mounted: ReturnType<typeof mountInBrowser>[] = []
    onTestFinished(() => {
      for (const fixture of mounted) fixture.unmount()
      clone.mockRestore()
      create.mockRestore()
    })
    const count = 12
    for (let i = 0; i < count; i++) {
      mounted.push(mountInBrowser(build() as unknown as VNodeChild))
    }
    await flush()

    const wrappers = mounted.map(({ container }) => container.querySelector('.clone-contract'))
    expect(wrappers.every((wrapper) => wrapper !== null)).toBe(true)
    expect(new Set(wrappers).size).toBe(count)
    expect(clone).toHaveBeenCalledTimes(count)
    expect(clone.mock.calls.every(([deep]) => deep === true)).toBe(true)
    expect(create.mock.calls.filter(([tag]) => tag === 'template')).toHaveLength(0)
    for (const wrapper of wrappers) expect(wrapper?.textContent).toBe('A')

    open.set(false)
    await flush()
    for (const [i, { container }] of mounted.entries()) {
      expect(container.querySelector('.clone-contract')).toBe(wrappers[i])
      expect(container.querySelector('.a')).toBeNull()
      expect(container.querySelector('.b')?.textContent).toBe('B')
    }
    expect(clone).toHaveBeenCalledTimes(count)
    expect(create.mock.calls.filter(([tag]) => tag === 'template')).toHaveLength(0)

    // Removing a container alone leaves reactive subscriptions alive. Invoke
    // every disposer and prove a subsequent write does no work in detached DOM.
    for (const fixture of mounted.splice(0)) fixture.unmount()
    const disposedReads = reads
    open.set(true)
    await flush()
    expect(reads).toBe(disposedReads)
  })
})
