/**
 * W21 — `<For each>` reading through a `computed()` declared in the
 * same component scope propagates signal updates to keyed children.
 *
 * Discovered in T4.2 / kanban audit (PR #982). Originally hypothesised
 * as an independent bug; turns out it's the same root cause as W23 —
 * the `_innerEffectCollector` suspension in `runUntracked`. Without
 * that, the W21 shape only fails when ColumnView is mounted inside an
 * outer For whose source mutates (which disposed ColumnView's inner
 * computed via the For's inner-effect cleanup).
 */
import { For, h } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

describe('W21 — For accessor reads through a sibling computed()', () => {
  it('top-level: For with computed() indirection in same component scope', () => {
    type Card = { id: string; title: string }
    type Column = { id: string; cards: Card[] }

    const columns = signal<Column[]>([{ id: 'todo', cards: [{ id: 'c1', title: 'first' }] }])

    function ColumnView(props: { columnId: string }) {
      const column = computed<Column | undefined>(() =>
        columns().find((c) => c.id === props.columnId),
      )

      return h(
        'div',
        { 'data-col': props.columnId },
        h(For as never, {
          each: () => column()?.cards ?? [],
          by: (c: Card) => c.id,
          children: (c: Card) => h('span', { 'data-card': c.id }, c.title),
        }),
      )
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    mount(h(ColumnView, { columnId: 'todo' }), container)

    expect(container.querySelectorAll('[data-card]').length).toBe(1)

    columns.set([
      {
        id: 'todo',
        cards: [
          { id: 'c1', title: 'first' },
          { id: 'c2', title: 'second' },
        ],
      },
    ])
    expect(container.querySelectorAll('[data-card]').length).toBe(2)

    columns.set([{ id: 'todo', cards: [{ id: 'c2', title: 'second' }] }])
    expect(container.querySelectorAll('[data-card]').length).toBe(1)

    container.remove()
  })

  it('nested-in-For: ColumnView mounted as outer-For child, computed() indirection survives outer-For source mutation', () => {
    // This is the literal kanban shape — exercises both W21 and W23 in
    // tandem. The outer For's source mutates on every state-tree write
    // (because the column array identity changes). Before the W23 fix,
    // ColumnView's `column` computed would be disposed by the outer For
    // on the FIRST mutation, breaking the inner For's accessor.
    type Card = { id: string; title: string }
    type Column = { id: string; cards: Card[] }

    const columns = signal<Column[]>([
      { id: 'todo', cards: [{ id: 'c1', title: 'first' }] },
      { id: 'doing', cards: [{ id: 'c2', title: 'second' }] },
    ])

    function ColumnView(props: { columnId: string }) {
      const column = computed<Column | undefined>(() =>
        columns().find((c) => c.id === props.columnId),
      )

      return h(
        'div',
        { 'data-col': props.columnId },
        h(For as never, {
          each: () => column()?.cards ?? [],
          by: (c: Card) => c.id,
          children: (c: Card) => h('span', { 'data-card': c.id }, c.title),
        }),
      )
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    mount(
      h(For as never, {
        each: () => columns().map((c) => c.id),
        by: (id: string) => id,
        children: (id: string) => h(ColumnView, { columnId: id }),
      }),
      container,
    )

    expect(
      container.querySelector('[data-col="todo"]')!.querySelectorAll('[data-card]').length,
    ).toBe(1)
    expect(
      container.querySelector('[data-col="doing"]')!.querySelectorAll('[data-card]').length,
    ).toBe(1)

    // Add a card to todo — outer For's source identity changes (new
    // columns array), inner For's source via computed() must update.
    columns.set([
      {
        id: 'todo',
        cards: [
          { id: 'c1', title: 'first' },
          { id: 'c3', title: 'third' },
        ],
      },
      { id: 'doing', cards: [{ id: 'c2', title: 'second' }] },
    ])
    expect(
      container.querySelector('[data-col="todo"]')!.querySelectorAll('[data-card]').length,
    ).toBe(2)

    // Delete c1 from todo — this is the second mutation, which was the
    // W23 failure point. Inner For must still re-render.
    columns.set([
      { id: 'todo', cards: [{ id: 'c3', title: 'third' }] },
      { id: 'doing', cards: [{ id: 'c2', title: 'second' }] },
    ])
    expect(
      container.querySelector('[data-col="todo"]')!.querySelectorAll('[data-card]').length,
    ).toBe(1)
    expect(
      container.querySelector('[data-col="todo"]')!.querySelector('[data-card="c3"]'),
    ).toBeTruthy()

    container.remove()
  })
})
