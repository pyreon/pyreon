/**
 * Error paths and prop mappings the compat layer gets wrong SILENTLY.
 *
 * Three groups, each chosen because the failure produces no error:
 *
 *   * `readonly()` / `shallowReadonly()` enforcement. A readonly proxy that
 *     accepts a write is worse than no proxy at all — the caller believes the
 *     object is protected and the mutation lands. The internal identity
 *     symbols (`V_RAW`, `V_IS_READONLY`) must be exempt, or `toRaw()` and
 *     `isReadonly()` throw on the very objects they exist to inspect.
 *
 *   * `watch`'s re-entrancy guard. A callback that writes the source it
 *     watches re-enters the effect; without the guard that is an unbounded
 *     recursion, and the shape is ordinary Vue code (normalising a value in
 *     the watcher that produced it).
 *
 *   * `<Transition>`'s Vue-to-Pyreon prop mapping. Twelve conditional
 *     forwards, of which the existing suite passed two. A dropped mapping does
 *     not throw: the animation simply does not apply, which reads as a CSS
 *     problem rather than a compat-layer one.
 */
import { h } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import {
  computed,
  isReadonly,
  reactive,
  readonly,
  ref,
  shallowReadonly,
  toRaw,
  Transition,
  TransitionGroup,
  watch,
} from '../index'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

// ─── readonly enforcement ────────────────────────────────────────────────────

describe('readonly proxies refuse writes and stay inspectable', () => {
  test('a deep readonly proxy throws on set and on delete', () => {
    // Silently ignoring the write is the dangerous alternative: the caller
    // believes the object is frozen and the mutation lands anyway.
    const o = readonly({ a: 1, nested: { b: 2 } }) as { a: number; nested: { b: number } }
    expect(() => {
      o.a = 2
    }).toThrow(/readonly/i)
    expect(() => {
      delete (o as unknown as Record<string, unknown>).a
    }).toThrow(/readonly/i)
  })

  test('readonly is DEEP — a nested object is protected too', () => {
    // The whole difference from `shallowReadonly`. A shallow-only
    // implementation passes the spec above and still lets `o.nested.b = 3`
    // through, which is the bug this distinguishes.
    const o = readonly({ nested: { b: 2 } }) as { nested: { b: number } }
    expect(() => {
      o.nested.b = 3
    }).toThrow(/readonly/i)
  })

  test('shallowReadonly protects the TOP level only', () => {
    const o = shallowReadonly({ a: 1, nested: { b: 2 } }) as { a: number; nested: { b: number } }
    expect(() => {
      o.a = 2
    }).toThrow(/readonly/i)
    // Deliberately allowed — that is what "shallow" means.
    expect(() => {
      o.nested.b = 3
    }).not.toThrow()
  })

  test('isReadonly and toRaw work THROUGH the proxy on both kinds', () => {
    // These read the internal identity symbols, and the proxy's `set` trap
    // must exempt them. Without the exemption the inspection helpers throw on
    // exactly the objects they exist to inspect.
    const raw = { a: 1, nested: { b: 2 } }
    for (const [label, proxy] of [
      ['deep', readonly(raw)],
      ['shallow', shallowReadonly(raw)],
    ] as Array<[string, object]>) {
      expect(isReadonly(proxy), `${label} must report readonly`).toBe(true)
      expect(toRaw(proxy), `${label} must unwrap to the original`).toBe(raw)
    }
  })

  test('a plain reactive object is NOT readonly', () => {
    // The negative arm — without it "always true" passes the specs above.
    const r = reactive({ a: 1 })
    expect(isReadonly(r)).toBe(false)
    expect(() => {
      r.a = 2
    }).not.toThrow()
  })

  test('a computed with no setter throws a NAMED error on write', () => {
    // Vue's own behaviour, and the message has to say why — "cannot set" with
    // no explanation sends the reader looking for a typo.
    const c = computed(() => 1)
    expect(() => {
      ;(c as { value: number }).value = 2
    }).toThrow(/readonly/i)
  })
})

// ─── watch re-entrancy ───────────────────────────────────────────────────────

describe('watch — a callback that writes its own source terminates', () => {
  test('does not recurse when the callback writes the watched ref', async () => {
    // Ordinary Vue: normalise in the watcher that produced the value. Without
    // the `running` guard this recurses until the stack gives out.
    const n = ref(1)
    let runs = 0
    watch(
      () => (n as { value: number }).value,
      () => {
        runs++
        if (runs < 50) (n as { value: number }).value = runs
      },
    )
    ;(n as { value: number }).value = 2
    await sleep(20)
    expect(runs, 'the watcher must not recurse unboundedly').toBeLessThan(50)
  })

  test('immediate: true fires before any change, with undefined as the old value', async () => {
    // The first call has no previous value to report. Passing the CURRENT one
    // as `old` would make every immediate watcher see old === new.
    const n = ref(5)
    const seen: Array<[unknown, unknown]> = []
    watch(
      () => (n as { value: number }).value,
      (nv, ov) => {
        seen.push([nv, ov])
      },
      { immediate: true },
    )
    expect(seen.length, 'immediate must fire at once').toBe(1)
    expect(seen[0]![0]).toBe(5)
    expect(seen[0]![1], 'no previous value exists on the first call').toBeUndefined()

    ;(n as { value: number }).value = 6
    await sleep(20)
    expect(seen[seen.length - 1], 'a later change reports the real old value').toEqual([6, 5])
  })

  test('without immediate, nothing fires until a change', async () => {
    const n = ref(5)
    let runs = 0
    watch(
      () => (n as { value: number }).value,
      () => runs++,
    )
    await sleep(20)
    expect(runs, 'a non-immediate watcher is silent until the source moves').toBe(0)
  })
})

// ─── Transition prop mapping ─────────────────────────────────────────────────

describe('Transition maps every Vue class prop to its Pyreon name', () => {
  // Vue spells them `enterFromClass`; Pyreon spells them `enterFrom`. Twelve
  // conditional forwards, and a dropped one does not throw — the animation
  // just never applies, which reads as a CSS bug.
  test('enter and leave classes reach the element, and the hooks fire', async () => {
    const show = signal(false)
    const fired: string[] = []
    const el = container()
    mount(
      h(
        Transition as ComponentFn,
        {
          show: () => show(),
          name: 'fade',
          appear: true,
          enterFromClass: 'e-from',
          enterActiveClass: 'e-active',
          enterToClass: 'e-to',
          leaveFromClass: 'l-from',
          leaveActiveClass: 'l-active',
          leaveToClass: 'l-to',
          onBeforeEnter: () => fired.push('beforeEnter'),
          onAfterEnter: () => fired.push('afterEnter'),
          onBeforeLeave: () => fired.push('beforeLeave'),
          onAfterLeave: () => fired.push('afterLeave'),
        } as Record<string, unknown>,
        h('div', { class: 'box' }, 'x'),
      ),
      el,
    )

    show.set(true)
    await sleep(20)
    const box = el.querySelector('.box')!
    expect(box.className, 'the enter classes must be applied').toContain('e-active')
    expect(box.className).toContain('e-to')
    expect(fired, 'onBeforeEnter must be forwarded').toContain('beforeEnter')

    // `onAfterEnter` waits for a real transitionend; happy-dom emits none, so
    // dispatch one rather than sit out the 5s timeout fallback.
    box.dispatchEvent(new Event('transitionend'))
    await sleep(20)
    expect(fired, 'onAfterEnter must be forwarded too').toContain('afterEnter')

    show.set(false)
    await sleep(20)
    const leaving = el.querySelector('.box')!
    expect(leaving.className, 'the leave classes must be applied').toContain('l-active')
    expect(leaving.className).toContain('l-to')
    expect(fired).toContain('beforeLeave')
  })

  test('omitting every optional prop is fine — no undefined leaks through', async () => {
    // The false arm of all twelve forwards. Passing `undefined` on rather than
    // omitting the key would put `class="undefined"` on the element.
    const show = signal(true)
    const el = container()
    mount(
      h(
        Transition as ComponentFn,
        { show: () => show() } as Record<string, unknown>,
        h('div', { class: 'bare' }, 'x'),
      ),
      el,
    )
    await sleep(20)
    expect(el.innerHTML, 'no undefined may reach the DOM').not.toContain('undefined')
    expect(el.querySelector('.bare')).not.toBeNull()
  })
})

describe('TransitionGroup maps the same surface', () => {
  test('accepts the full Vue prop set over a keyed list', async () => {
    // TransitionGroup repeats the whole mapping block and adds two of its own
    // (`tag`, `moveClass`), so it repeats the risk. Its API is a keyed list —
    // `items` / `keyFn` / `render` — not children.
    const el = container()
    mount(
      h(
        TransitionGroup as ComponentFn,
        {
          items: () => [{ id: 'a' }, { id: 'b' }],
          keyFn: (it: { id: string }) => it.id,
          render: (it: { id: string }) => h('div', { class: `item-${it.id}` }, it.id),
          tag: 'ul',
          name: 'list',
          appear: true,
          moveClass: 'l-move',
          enterFromClass: 'e-from',
          enterActiveClass: 'e-active',
          enterToClass: 'e-to',
          leaveFromClass: 'l-from',
          leaveActiveClass: 'l-active',
          leaveToClass: 'l-to',
          onBeforeEnter: () => undefined,
          onAfterEnter: () => undefined,
          onBeforeLeave: () => undefined,
          onAfterLeave: () => undefined,
        } as Record<string, unknown>,
      ),
      el,
    )
    await sleep(20)
    expect(el.querySelector('.item-a'), 'rows must render through the mapping').not.toBeNull()
    expect(el.querySelector('.item-b')).not.toBeNull()
    expect(el.querySelector('ul'), 'the `tag` prop must be forwarded').not.toBeNull()
    expect(el.innerHTML, 'no undefined may reach the DOM').not.toContain('undefined')
  })

  test('omitting the optional props renders the list unstyled rather than breaking', () => {
    // The false arm of every forward, on the group variant.
    const el = container()
    mount(
      h(
        TransitionGroup as ComponentFn,
        {
          items: () => [{ id: 'x' }],
          keyFn: (it: { id: string }) => it.id,
          render: (it: { id: string }) => h('div', { class: `bare-${it.id}` }, it.id),
        } as Record<string, unknown>,
      ),
      el,
    )
    expect(el.querySelector('.bare-x')).not.toBeNull()
    expect(el.innerHTML).not.toContain('undefined')
  })
})
