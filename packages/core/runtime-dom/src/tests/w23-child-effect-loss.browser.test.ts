/**
 * W23 — Child effects in For-mounted components lose all signal
 * subscriptions after the For's source signal first re-fires.
 *
 * Discovered in T4.2 / kanban audit (PR #982). Root cause: `runUntracked`
 * only suspended `activeEffect`, not `_innerEffectCollector`. So when
 * `mountFor` wrapped child mounts in `runUntracked` (PR #490), child
 * component effects were still auto-registered as inner effects of the
 * For's outer effect. On the For's next re-run, `runCleanup()` disposed
 * them.
 *
 * Fix lives in `tracking.ts` — `runUntracked` now suspends both.
 *
 * Bisect-verify: temporarily revert the `_innerEffectCollector = null` /
 * restore lines in `runUntracked` → this test fails with row-a and row-b
 * missing from the final `runs` array.
 */
import { For, h } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

describe('W23 — child effect subscription persistence', () => {
  it('row effect inside <For> keeps tracking external signal across For source re-runs', () => {
    const items = signal([{ id: 'a' }, { id: 'b' }])
    const external = signal('initial')
    const runs: string[] = []

    let setupCount = 0
    function Row(props: { id: string }) {
      const setupN = ++setupCount
      runs.push(`setup row-${props.id} (#${setupN})`)
      effect(() => {
        const v = external()
        runs.push(`row-${props.id} (#${setupN})/${v}`)
      })
      return h('div', { 'data-id': props.id }, props.id)
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    // Cast through `unknown` — For's typed children expect `(it: T) =>
    // VNodeChild` but `h()`'s overload extracts `Props['children']` which
    // is the strict VNodeChild union. The runtime accepts a render fn,
    // the type system doesn't model this on the h() side. Use a
    // function-typed `children` prop to avoid the variadic-children overload.
    mount(
      h(For as never, {
        each: () => items(),
        by: (it: { id: string }) => it.id,
        children: (it: { id: string }) => h(Row, { id: it.id }),
      }),
      container,
    )

    // Initial: both rows set up + fire
    expect(runs).toEqual([
      'setup row-a (#1)',
      'row-a (#1)/initial',
      'setup row-b (#2)',
      'row-b (#2)/initial',
    ])
    runs.length = 0

    external.set('flip-1')
    expect(runs).toEqual(['row-a (#1)/flip-1', 'row-b (#2)/flip-1'])
    runs.length = 0

    // Source signal change: For re-runs, mounts row 'c'. Existing rows
    // (a, b) MUST NOT be re-set-up. Their effects MUST survive.
    items.set([...items.peek(), { id: 'c' }])
    expect(runs).toEqual(['setup row-c (#3)', 'row-c (#3)/flip-1'])
    runs.length = 0

    // CONTRACT (was W23 bug): all three rows' effects must fire on
    // external.set after the For's source re-run.
    external.set('flip-2')
    expect(runs.sort()).toEqual(
      ['row-a (#1)/flip-2', 'row-b (#2)/flip-2', 'row-c (#3)/flip-2'].sort(),
    )

    // Verify the fix survives MULTIPLE For source re-runs.
    items.set([...items.peek(), { id: 'd' }])
    runs.length = 0
    external.set('flip-3')
    expect(runs.sort()).toEqual(
      ['row-a (#1)/flip-3', 'row-b (#2)/flip-3', 'row-c (#3)/flip-3', 'row-d (#4)/flip-3'].sort(),
    )

    container.remove()
  })
})
