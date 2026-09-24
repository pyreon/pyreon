/**
 * The multi-source `watch` and the component-instance helpers.
 *
 * `watch([a, b], cb)` is standard Vue and had NO test — the whole
 * array-getter implementation (its own `immediate` handling, its own
 * re-entrancy guard, and the old-values array it has to build on the first
 * run) was unreached. It is a separate code path from the single-source form,
 * not a wrapper around it, so covering one says nothing about the other.
 *
 * The instance helpers are here for the shape they share: `ctx._props ?? {}`.
 * A component rendered with NO props at all is the ordinary case for a
 * layout or a leaf, and every one of `useAttrs`, `useSlots` and `emit` reads
 * props through that fallback. Without it they throw on exactly the
 * components least likely to be tested.
 */
import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { beginRender, endRender, type RenderContext } from '../jsx-runtime'
import { ref, useAttrs, useSlots, watch } from '../index'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const val = (r: unknown): { value: number } => r as { value: number }

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

/** Run `fn` inside a vue-compat render context, the way its jsx runtime does. */
function withHookCtx<T>(fn: () => T): { result: T; ctx: RenderContext } {
  const ctx: RenderContext = {
    hooks: [],
    scheduleRerender: () => {},
    pendingEffects: [],
    pendingLayoutEffects: [],
    unmounted: false,
    unmountCallbacks: [],
  }
  beginRender(ctx)
  const result = fn()
  endRender()
  return { result, ctx }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('watch over an ARRAY of sources', () => {
  test('reports every source, and only fires once per change', async () => {
    const a = ref(1)
    const b = ref(10)
    const seen: Array<[unknown[], unknown[]]> = []
    watch(
      [() => val(a).value, () => val(b).value],
      (nv, ov) => {
        seen.push([nv as unknown[], ov as unknown[]])
      },
    )

    val(a).value = 2
    await sleep(20)
    expect(seen.length, 'one change, one call').toBe(1)
    expect(seen[0]![0], 'the new values carry BOTH sources').toEqual([2, 10])
    expect(seen[0]![1], 'and so do the old ones').toEqual([1, 10])

    val(b).value = 20
    await sleep(20)
    expect(seen[1]![0]).toEqual([2, 20])
    expect(seen[1]![1]).toEqual([2, 10])
  })

  test('immediate fires ONCE with an all-undefined old array', async () => {
    // The array form builds its old-values array by mapping the getters; on
    // the first call there is nothing to report, so every slot is undefined.
    // Reporting the CURRENT values would make an immediate watcher see
    // old === new for every source.
    const a = ref(1)
    const b = ref(10)
    const seen: Array<[unknown[], unknown[]]> = []
    watch(
      [() => val(a).value, () => val(b).value],
      (nv, ov) => {
        seen.push([nv as unknown[], ov as unknown[]])
      },
      { immediate: true },
    )

    expect(seen.length, 'exactly one immediate call').toBe(1)
    expect(seen[0]![0]).toEqual([1, 10])
    expect(seen[0]![1], 'one undefined per source').toEqual([undefined, undefined])

    val(a).value = 2
    await sleep(20)
    expect(seen.length, 'and then one more per change').toBe(2)
    expect(seen[1]![1], 'the second call has real old values').toEqual([1, 10])
  })

  test('a callback that writes one of its own sources terminates', async () => {
    // Same re-entrancy hazard as the single-source form, with its own guard.
    const a = ref(1)
    const b = ref(0)
    let runs = 0
    watch(
      [() => val(a).value, () => val(b).value],
      () => {
        runs++
        if (runs < 50) val(b).value = runs
      },
    )
    val(a).value = 2
    await sleep(30)
    expect(runs, 'the array watcher must not recurse unboundedly').toBeLessThan(50)
  })

  test('a change to EITHER source fires the watcher', async () => {
    // A combined getter that only tracked the first source would pass the
    // specs above whenever the test happens to move `a` first.
    const a = ref(1)
    const b = ref(10)
    let runs = 0
    watch([() => val(a).value, () => val(b).value], () => runs++)
    val(b).value = 11
    await sleep(20)
    expect(runs, 'the SECOND source must be tracked too').toBe(1)
  })
})

describe('component-instance helpers on a component with NO props', () => {
  test('useAttrs and useSlots return empty rather than throwing', () => {
    // The `ctx._props ?? {}` fallback. A layout or leaf rendered with no props
    // is ordinary, and it is exactly the component nobody writes a test for.
    let attrs: unknown
    let slots: unknown
    const Comp: ComponentFn = () => {
      attrs = useAttrs()
      slots = useSlots()
      return h('div', { class: 'ok' }, 'x')
    }
    const el = container()
    expect(() => mount(h(Comp, {}), el)).not.toThrow()
    expect(el.querySelector('.ok')).not.toBeNull()
    expect(attrs, 'no props means no attrs, not a crash').toEqual({})
    expect(slots).toBeDefined()
  })
})

describe('watch INSIDE a component render context', () => {
  // A different implementation from the top-level form: it stores the stop
  // function in the component's HOOK SLOTS and registers an unmount callback,
  // so a re-render reuses the same watcher instead of subscribing again, and
  // the watcher stops when the component goes away. Both the single-source and
  // array forms carry their own copy of that path and neither was reached —
  // every existing watch test calls it at module scope, where a different
  // branch runs.
  test('the ARRAY form registers once and is reused across re-renders', async () => {
    const a = ref(1)
    const b = ref(10)
    const seen: unknown[][] = []
    const setup = () =>
      watch(
        [() => val(a).value, () => val(b).value],
        (nv) => {
          seen.push(nv as unknown[])
        },
        { immediate: true },
      )

    const { ctx, result: stop } = withHookCtx(setup)
    expect(seen.length, 'immediate fires once inside a render context too').toBe(1)
    expect(seen[0]).toEqual([1, 10])
    expect(ctx.hooks.length, 'the stop fn is parked in a hook slot').toBeGreaterThan(0)

    val(a).value = 2
    await sleep(20)
    expect(seen.length, 'and once per change').toBe(2)

    // A RE-RENDER must reuse the slot, not subscribe a second watcher —
    // otherwise every render doubles the callbacks for the rest of the
    // component's life.
    beginRender(ctx)
    setup()
    endRender()
    val(a).value = 3
    await sleep(20)
    expect(seen.length, 'a re-render must not add a second subscription').toBe(3)

    stop()
    val(a).value = 4
    await sleep(20)
    expect(seen.length, 'stop() ends it').toBe(3)
  })

  test('the SINGLE-source form does the same', async () => {
    const n = ref(1)
    const seen: unknown[] = []
    const setup = () =>
      watch(
        () => val(n).value,
        (nv) => {
          seen.push(nv)
        },
        { immediate: true },
      )

    const { ctx, result: stop } = withHookCtx(setup)
    expect(seen, 'immediate fires exactly once').toEqual([1])

    val(n).value = 2
    await sleep(20)
    expect(seen).toEqual([1, 2])

    beginRender(ctx)
    setup()
    endRender()
    val(n).value = 3
    await sleep(20)
    expect(seen, 'a re-render must not double-subscribe').toEqual([1, 2, 3])

    stop()
    val(n).value = 4
    await sleep(20)
    expect(seen).toEqual([1, 2, 3])
  })
})
