// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Lists row (LST-1): keyed REORDER on a device. The big-list page proves a
// 10,000-row list is created lazily; nothing proved that a keyed list keeps
// each row's identity when the order changes. Three moves are exercised: move
// the first row to the end, sort descending, and swap the first and last rows.
//
// Identity is observable because each row is its own component with LOCAL
// state (`marked`). A list keyed by position would leave the mark where it was
// and hand it to whichever row moved into that slot; a list keyed by `id` moves
// the mark with the row. The device tests mark one row, reorder, and assert the
// mark is still on that row's label and on no other.
//
// The 10,000-row half reverses a lazy list in one write and asserts the new
// first row renders inside the test's timeout, and that the old first row is
// gone from the top of the list.
import { For } from '@pyreon/core'
import { Button, Inline, Scroll, Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { useNavigate } from '@pyreon/router'

export type ReorderItem = { id: number; label: string }

export function ReorderRow(props: { item: ReorderItem }) {
  const marked = signal(false)
  return (
    <Inline gap={2}>
      <Text>{marked() ? `${props.item.label} marked` : props.item.label}</Text>
      <Button onPress={() => marked.set(true)}>Mark {props.item.label}</Button>
    </Inline>
  )
}

export function ReorderPage() {
  const navigate = useNavigate()
  const items = signal<ReorderItem[]>([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
    { id: 3, label: 'Charlie' },
    { id: 4, label: 'Delta' },
  ])
  const big = signal<ReorderItem[]>(Array.from({ length: 10000 }, (_, i) => ({ id: i, label: `Item ${i}` })))
  return (
    <Stack gap={2} padding={4} data-testid="reorder-page">
      <Text>Reorder</Text>
      <Text data-testid="reorder-order">Order: {items().map((it) => it.label).join(',')}</Text>
      <Inline gap={2}>
        <Button onPress={() => items.set([...items().slice(1), items()[0]])}>Move first</Button>
        <Button onPress={() => items.set([...items()].sort((a, b) => b.id - a.id))}>Sort desc</Button>
        <Button
          onPress={() => {
            const cur = items()
            const last = cur.length - 1
            items.set(cur.map((it, i) => (i === 0 ? cur[last] : i === last ? cur[0] : it)))
          }}
        >
          Swap ends
        </Button>
      </Inline>
      <For each={items()} by={(it) => it.id}>
        {(it) => <ReorderRow item={it} />}
      </For>
      <Inline gap={2}>
        <Button onPress={() => big.set([...big()].reverse())}>Reverse big</Button>
        <Button onPress={() => navigate('/')}>Back to Home</Button>
      </Inline>
      <Scroll data-testid="reorder-big-scroll">
        <For each={big()} by={(it) => it.id}>
          {(it) => <Text>{it.label}</Text>}
        </For>
      </Scroll>
    </Stack>
  )
}
