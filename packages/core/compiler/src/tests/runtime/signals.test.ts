// @vitest-environment happy-dom
/// <reference lib="dom" />
import { computed, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { flush } from '@pyreon/test-utils/browser'
import { compileAndMount } from './harness'

/**
 * Compiler-runtime tests — signal patterns in JSX.
 *
 * The #352 signal-method auto-call bug surfaced because the compiler
 * couldn't tell `signal.set(x)` (call on the signal as object) from
 * `signal()` (call the signal to read). The fix added scope-aware
 * detection. This file pins down the matrix: bare reference, function
 * call, member call, accessor wrapper, computed — in different positions.
 */

describe('compiler-runtime — signals', () => {
  it('signal in text position is reactive', async () => {
    const name = signal('alice')
    const { container, unmount } = compileAndMount(
      `<div><span id="s">{name()}</span></div>`,
      { name },
    )
    expect(container.querySelector('#s')!.textContent).toBe('alice')
    name.set('bob')
    await flush()
    expect(container.querySelector('#s')!.textContent).toBe('bob')
    unmount()
  })

  it('signal.method() in event handler does not auto-call signal', () => {
    const x = signal(0)
    const { container, unmount } = compileAndMount(
      `<div><button id="b" onClick={() => x.set(99)}>set</button></div>`,
      { x },
    )
    container.querySelector<HTMLButtonElement>('#b')!.click()
    expect(x()).toBe(99)
    unmount()
  })

  it('signal.update() in event handler does not auto-call signal', () => {
    const x = signal(10)
    const { container, unmount } = compileAndMount(
      `<div><button id="b" onClick={() => x.update((v) => v * 2)}>x2</button></div>`,
      { x },
    )
    const btn = container.querySelector<HTMLButtonElement>('#b')!
    btn.click()
    btn.click()
    expect(x()).toBe(40)
    unmount()
  })

  it('signal.peek() in event handler does not auto-call signal', () => {
    const x = signal(7)
    const out = { value: 0 }
    const { container, unmount } = compileAndMount(
      `<div><button id="b" onClick={() => { out.value = x.peek() }}>read</button></div>`,
      { x, out },
    )
    container.querySelector<HTMLButtonElement>('#b')!.click()
    expect(out.value).toBe(7)
    unmount()
  })

  it('computed value reflected in DOM updates when source changes', async () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a() + b())
    const { container, unmount } = compileAndMount(
      `<div><span id="s">{sum()}</span></div>`,
      { sum },
    )
    expect(container.querySelector('#s')!.textContent).toBe('5')
    a.set(10)
    await flush()
    expect(container.querySelector('#s')!.textContent).toBe('13')
    unmount()
  })

  it('explicit accessor wrapper preserves reactivity', async () => {
    const x = signal('hi')
    const { container, unmount } = compileAndMount(
      `<div><span id="s">{() => x()}</span></div>`,
      { x },
    )
    expect(container.querySelector('#s')!.textContent).toBe('hi')
    x.set('hey')
    await flush()
    expect(container.querySelector('#s')!.textContent).toBe('hey')
    unmount()
  })

  it('signal in attribute position is reactive', async () => {
    const cls = signal('a')
    const { container, unmount } = compileAndMount(
      `<div><span id="s" class={cls()}>x</span></div>`,
      { cls },
    )
    expect(container.querySelector('#s')!.className).toBe('a')
    cls.set('b')
    await flush()
    expect(container.querySelector('#s')!.className).toBe('b')
    unmount()
  })

  it('multiple signals on the same element track independently', async () => {
    const txt = signal('hello')
    const cls = signal('a')
    const { container, unmount } = compileAndMount(
      `<div><span id="s" class={cls()}>{txt()}</span></div>`,
      { txt, cls },
    )
    const span = container.querySelector('#s')!
    expect(span.textContent).toBe('hello')
    expect(span.className).toBe('a')
    txt.set('world')
    await flush()
    expect(span.textContent).toBe('world')
    expect(span.className).toBe('a')
    cls.set('b')
    await flush()
    expect(span.textContent).toBe('world')
    expect(span.className).toBe('b')
    unmount()
  })
})
