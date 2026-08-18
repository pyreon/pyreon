/**
 * Component setup frames RESTORE, they do not reset.
 *
 * `runWithHooks` used to open the frame with `setCurrentHooks(hooks)` and close
 * it with `setCurrentHooks(null)` — correct only at depth 1. Component setup
 * nests: the compiler lowers an element with a conditional/`.map` child to
 * `_tpl(html, bindFn)` whose `bindFn` calls `_mountSlot(...)`, and `_tpl` runs
 * `bindFn` synchronously at its call site, so a child component's full
 * `runWithHooks` happens partway through the parent's own setup. The inner
 * frame's exit then closed the OUTER one and every hook the parent registered
 * afterwards was silently dropped.
 *
 * Third instance of the reset-vs-restore class catalogued in
 * `.claude/rules/anti-patterns.md`.
 *
 * These are the unit-level specs. The real-compiler twin — which proves the
 * shape is reachable from ordinary JSX rather than only from a hand-nested
 * call — lives in
 * `@pyreon/runtime-dom`'s `src/tests/nested-setup-hooks-frame.test.tsx`.
 */
import { describe, expect, test, vi } from 'vitest'
import { runWithHooks } from '../component'
import { onMount, onUnmount } from '../lifecycle'

describe('setup frame nesting', () => {
  test('a hook registered AFTER a nested setup still lands on the outer component', () => {
    const outerHook = () => {}
    const innerHook = () => {}
    let inner: ReturnType<typeof runWithHooks> | undefined

    const outer = runWithHooks(() => {
      inner = runWithHooks(() => {
        onMount(innerHook)
        return null
      }, {})
      onMount(outerHook)
      return null
    }, {})

    expect(inner?.hooks.mount).toEqual([innerHook])
    // Pre-fix this was `null`: the inner frame's exit reset the current frame
    // to null, so the outer `onMount` took the "outside component setup" path.
    expect(outer.hooks.mount).toEqual([outerHook])
    expect(outer.hooks).not.toBe(inner?.hooks)
  })

  test('a hookless nested setup does not steal the outer frame', () => {
    const outerHook = () => {}
    const outer = runWithHooks(() => {
      runWithHooks(() => null, {})
      onUnmount(outerHook)
      return null
    }, {})
    expect(outer.hooks.unmount).toEqual([outerHook])
  })

  test('a nested setup that THROWS still restores the outer frame', () => {
    const outerHook = () => {}
    const outer = runWithHooks(() => {
      expect(() =>
        runWithHooks(() => {
          throw new Error('inner boom')
        }, {}),
      ).toThrow('inner boom')
      onMount(outerHook)
      return null
    }, {})
    expect(outer.hooks.mount).toEqual([outerHook])
  })

  test('three levels deep, every frame keeps its own hooks', () => {
    const a = () => {}
    const b = () => {}
    const c = () => {}
    let mid: ReturnType<typeof runWithHooks> | undefined
    let deep: ReturnType<typeof runWithHooks> | undefined

    const top = runWithHooks(() => {
      mid = runWithHooks(() => {
        deep = runWithHooks(() => {
          onMount(c)
          return null
        }, {})
        onMount(b)
        return null
      }, {})
      onMount(a)
      return null
    }, {})

    expect(deep?.hooks.mount).toEqual([c])
    expect(mid?.hooks.mount).toEqual([b])
    expect(top.hooks.mount).toEqual([a])
  })

  test('after the outermost frame closes, hooks are no-ops again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      runWithHooks(() => {
        runWithHooks(() => null, {})
        return null
      }, {})
      warn.mockClear()
      onMount(() => {})
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('outside component setup'))
    } finally {
      warn.mockRestore()
    }
  })
})
