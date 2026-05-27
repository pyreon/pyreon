# W23 minimal repro — child effect loses subscription after For re-run

This is the kanban-audit's most-severe finding. Reproducer outline below.

## Setup

A component is mounted as a `<For>` child. Inside it, an `effect()` reads
TWO independent signals: the For's source signal (A) AND an unrelated
signal (B).

After A is written ONCE (triggering the For's effect to re-run), the
child's effect:
- DOES fire on the first A.set (initial re-run).
- Does NOT fire on subsequent A.set.
- Does NOT fire on B.set.

The bug is a permanent loss of tracking inside the child's effect after
the first re-fire of the outer For.

## Repro code

```tsx
// e2e/repro/for-child-effect-loss.spec.ts or unit test
import { test, expect } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { signal, effect } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

test('child effect loses subscription after For re-run', () => {
  const items = signal([{ id: '1' }, { id: '2' }])
  const flag = signal('initial')
  const runs: string[] = []

  function Row(props: { id: string }) {
    effect(() => {
      // Reads BOTH signals.
      const f = flag()
      items() // also subscribe to items, mirrors kanban shape
      runs.push(`row-${props.id}/${f}`)
    })
    return <div data-id={props.id}>{props.id}</div>
  }

  const container = document.createElement('div')
  mount(
    <For each={() => items()} by={(it) => it.id}>
      {(it) => <Row id={it.id} />}
    </For>,
    container,
  )

  // Initial: 2 effects fire
  expect(runs).toEqual(['row-1/initial', 'row-2/initial'])
  runs.length = 0

  // Write to flag → both row effects fire
  flag.set('after-1')
  expect(runs).toEqual(['row-1/after-1', 'row-2/after-1'])
  runs.length = 0

  // Write to items (the For's source) — adds row 3
  items.set([...items.peek(), { id: '3' }])

  // For's effect re-runs, mounts row 3 (correct)
  expect(runs).toContain('row-3/after-1')
  runs.length = 0

  // NOW write to flag again. CONTRACT: all three row effects should fire.
  // ACTUAL: zero effects fire. The child effects lost their subscription
  // to `flag` when the For re-ran.
  flag.set('after-2')
  expect(runs).toEqual(['row-1/after-2', 'row-2/after-2', 'row-3/after-2'])
  // ^ FAILS — runs is empty.
})
```

## What to bisect against

Likely candidates:
1. PR #490 `runUntracked` wrap in `mountFor`'s child mount work
2. Any later mountFor refactor that touches the child-effect lifecycle
3. The EffectScope-ownership chain established when mounting a component
   inside `mountFor`'s `runUntracked`

The kanban example surfaces this via the add → delete sequence:
- Add card → For's source fires → For's effect re-runs to mount the new
  card (works once)
- Delete card → For's source fires → For's effect doesn't re-run; CardItem's
  internal computed DOES update (because it's a separate computed not
  subscribed via the For), leaving a phantom empty `<div class="card">`

## Bisect target

`packages/core/runtime-dom/src/nodes.ts` `mountFor` — the `effect()`
that wraps `source()` + `runUntracked(() => /* child mounts */)`.
