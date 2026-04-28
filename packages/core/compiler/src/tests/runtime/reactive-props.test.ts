// @vitest-environment happy-dom
/// <reference lib="dom" />
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { flush } from '@pyreon/test-utils/browser'
import { compileAndMount } from './harness'

/**
 * Compiler-runtime tests — reactive props inlining.
 *
 * The compiler auto-detects `const` variables derived from `props.*` /
 * `splitProps` results and inlines them at JSX use sites for
 * fine-grained reactivity. `const x = props.y ?? 'default'; return
 * <div>{x}</div>` compiles to `_bind(() => { t.data = (props.y ?? 'default') })`.
 *
 * This file pins the contract: the inlined expression really IS reactive
 * at the call site — changing the underlying signal updates the DOM
 * without re-rendering the component.
 */

describe('compiler-runtime — reactive props inlining', () => {
  it('text content from a signal updates reactively', async () => {
    const value = signal('initial')
    const { container, unmount } = compileAndMount(
      `<div><p id="p">{value()}</p></div>`,
      { value },
    )
    expect(container.querySelector('#p')!.textContent).toBe('initial')
    value.set('updated')
    await flush()
    expect(container.querySelector('#p')!.textContent).toBe('updated')
    unmount()
  })

  it('class attribute updates reactively', async () => {
    const cls = signal('a')
    const { container, unmount } = compileAndMount(
      `<div><span id="s" class={cls()}>x</span></div>`,
      { cls },
    )
    expect(container.querySelector('#s')!.className).toBe('a')
    cls.set('b c')
    await flush()
    expect(container.querySelector('#s')!.className).toBe('b c')
    unmount()
  })

  it('expression with multiple signals tracks all dependencies', async () => {
    const a = signal('hello')
    const b = signal('world')
    const { container, unmount } = compileAndMount(
      `<div><p id="p">{a() + ' ' + b()}</p></div>`,
      { a, b },
    )
    expect(container.querySelector('#p')!.textContent).toBe('hello world')
    a.set('hi')
    await flush()
    expect(container.querySelector('#p')!.textContent).toBe('hi world')
    b.set('there')
    await flush()
    expect(container.querySelector('#p')!.textContent).toBe('hi there')
    unmount()
  })

  it('nested signal access in template literal updates reactively', async () => {
    const name = signal('Alice')
    const count = signal(3)
    const { container, unmount } = compileAndMount(
      `<div><p id="p">{` + '`${name()} has ${count()} items`' + `}</p></div>`,
      { name, count },
    )
    expect(container.querySelector('#p')!.textContent).toBe('Alice has 3 items')
    count.set(7)
    await flush()
    expect(container.querySelector('#p')!.textContent).toBe('Alice has 7 items')
    name.set('Bob')
    await flush()
    expect(container.querySelector('#p')!.textContent).toBe('Bob has 7 items')
    unmount()
  })
})
