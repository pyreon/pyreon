import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it, vi } from 'vitest'
import { onUpdated, readonly, ref, shallowReadonly, watch } from '../index'
import { getCurrentCtx, jsx } from '../jsx-runtime'

// Coverage gate for runLayoutEffects (L82-88) + scheduleEffects re-run path
// (L91-99 cleanup-then-fn) in jsx-runtime.ts. The pendingLayoutEffects field
// has no public producer hook today (it's defensive infra for a future
// useLayoutEffect), so we push directly via getCurrentCtx() inside a Vue
// component body — same surface defineComponent would use.

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

const tick = () => new Promise<void>((r) => queueMicrotask(() => r()))

describe('vue-compat — runLayoutEffects', () => {
  it('runs queued layout-effect fn synchronously after render', () => {
    const ranAt: string[] = []
    const Comp = () => {
      const ctx = getCurrentCtx()
      if (ctx && ctx.pendingLayoutEffects.length === 0) {
        ctx.pendingLayoutEffects.push({
          fn: () => {
            ranAt.push('layout-fn')
            return undefined
          },
          deps: [],
          cleanup: undefined,
        })
      }
      return jsx('div', { children: 'x' })
    }
    const c = container()
    mount(jsx(Comp, {}), c)
    expect(ranAt).toContain('layout-fn')
  })

  it('runs cleanup before re-running the layout-effect fn', () => {
    const calls: string[] = []
    const cleanupFn = vi.fn(() => calls.push('cleanup'))
    const Comp = () => {
      const ctx = getCurrentCtx()
      if (ctx && ctx.pendingLayoutEffects.length === 0) {
        ctx.pendingLayoutEffects.push({
          fn: () => {
            calls.push('fn')
            return cleanupFn
          },
          deps: [],
          cleanup: cleanupFn, // pre-existing cleanup → forces the L84 branch
        })
      }
      return jsx('div', { children: 'y' })
    }
    const c = container()
    mount(jsx(Comp, {}), c)
    // The first run encounters entry.cleanup → calls it (L84), then runs fn
    expect(calls[0]).toBe('cleanup')
    expect(calls[1]).toBe('fn')
  })
})

describe('vue-compat — scheduleEffects', () => {
  it('runs queued effect fn asynchronously via microtask', async () => {
    const ran = vi.fn()
    const Comp = () => {
      const ctx = getCurrentCtx()
      if (ctx && ctx.pendingEffects.length === 0) {
        ctx.pendingEffects.push({
          fn: () => {
            ran()
            return undefined
          },
          deps: [],
          cleanup: undefined,
        })
      }
      return jsx('div', { children: 'z' })
    }
    const c = container()
    mount(jsx(Comp, {}), c)
    await tick()
    await tick()
    expect(ran).toHaveBeenCalled()
  })

  it('scheduleRerender debounces multiple .value writes into ONE re-render via microtask (L129-133)', async () => {
    // ref() inside a component captures scheduleRerender at hook time;
    // ref() outside does not. We expose the inner ref via a closure so we
    // can mutate it after mount.
    type RefHandle = { value: number } | null
    let exposed: RefHandle = null
    let renderCount = 0
    const Comp = () => {
      const count = ref(0)
      if (!exposed) exposed = count as unknown as { value: number }
      renderCount++
      return jsx('div', { children: String(count.value) })
    }
    const c = container()
    mount(jsx(Comp, {}), c)
    const initialRenders = renderCount

    // Three synchronous mutations — should coalesce into ONE microtask
    // (updateScheduled gate at L129) → one re-render. The hook-indexed
    // ref's setter calls scheduleRerender, exercising L129-133.
    expect(exposed).not.toBeNull()
    exposed!.value = 1
    exposed!.value = 2
    exposed!.value = 3
    await tick()
    await tick()
    await tick()
    expect(renderCount - initialRenders).toBe(1)
    expect(c.textContent).toContain('3')
  })

  it('onUpdated covers re-render-schedules path (L817-832)', async () => {
    type RefHandle = { value: number } | null
    let exposed: RefHandle = null
    const updateSpy = vi.fn()
    const Comp = () => {
      const count = ref(0)
      if (!exposed) exposed = count as unknown as { value: number }
      onUpdated(updateSpy)
      return jsx('div', { children: String(count.value) })
    }
    const c = container()
    mount(jsx(Comp, {}), c)
    await tick()
    await tick()
    const initial = updateSpy.mock.calls.length

    // Mutate → re-render → onUpdated schedules + fires
    exposed!.value = 1
    await tick()
    await tick()
    await tick()
    expect(updateSpy.mock.calls.length).toBeGreaterThan(initial)
  })

  it('watch(source, cb, { immediate: true }) fires once eagerly (L621-625)', () => {
    const r = ref(42)
    const cb = vi.fn()
    const stop = watch(r, cb, { immediate: true })
    // Immediate mode → fires synchronously with current value
    expect(cb).toHaveBeenCalled()
    expect(cb.mock.calls[0]?.[0]).toBe(42)
    stop()
  })

  it('watch([source1, source2], cb, { immediate: true }) fires once eagerly (L520-524)', () => {
    const a = ref(1)
    const b = ref('hi')
    const cb = vi.fn()
    const stop = watch([a, b], cb, { immediate: true })
    expect(cb).toHaveBeenCalled()
    expect(cb.mock.calls[0]?.[0]).toEqual([1, 'hi'])
    stop()
  })

  it('shallowReadonly inside a component is hook-indexed (L312-317)', () => {
    let firstProxy: unknown
    let secondProxy: unknown
    const Comp = () => {
      const obj = { a: 1, b: 2 }
      const ro = shallowReadonly(obj)
      if (!firstProxy) firstProxy = ro
      else secondProxy = ro
      return jsx('div', { children: 'x' })
    }
    const c = container()
    const dispose = mount(jsx(Comp, {}), c)
    expect(firstProxy).toBeDefined()
    expect(() => {
      ;(firstProxy as Record<string, number>).a = 99
    }).toThrow()
    dispose()
    // Mount again — hook-index returns a NEW proxy for the new context
    mount(jsx(Comp, {}), container())
    expect(secondProxy).toBeDefined()
  })

  it('readonly is exported and forbids writes', () => {
    const r = readonly({ x: 1 })
    expect(() => {
      ;(r as Record<string, number>).x = 2
    }).toThrow()
  })

  it('runs prior cleanup before re-running effect fn', async () => {
    const calls: string[] = []
    const cleanup = () => {
      calls.push('cleanup')
    }
    const Comp = () => {
      const ctx = getCurrentCtx()
      if (ctx && ctx.pendingEffects.length === 0) {
        ctx.pendingEffects.push({
          fn: () => {
            calls.push('fn')
            return cleanup // returned cleanup gets assigned to entry.cleanup
          },
          deps: [],
          cleanup, // pre-existing cleanup → forces the L95 branch
        })
      }
      return jsx('div', { children: 'cleanup-then-fn' })
    }
    const c = container()
    mount(jsx(Comp, {}), c)
    await tick()
    await tick()
    expect(calls).toContain('cleanup')
    expect(calls).toContain('fn')
  })
})
