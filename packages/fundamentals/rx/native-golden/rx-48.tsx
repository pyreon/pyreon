import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'
import { Text, Stack, For } from '@pyreon/primitives'

type Row = { id: number; price: number; tag: string | null }

// Every method over a typed source, composed, with a fractional reduce seed and a struct element.
export function Table() {
  const rows = signal<Row[]>([{ id: 1, price: 2.5, tag: 'a' }])
  const ids = signal([3, 1, 2, 3])
  const tags = signal<(string | null)[]>(['a', null])
  const nested = signal([[1], [2, 3]])
  const cheap = rx.filter(rows, (r) => r.price < 3)
  const total = rx.reduce(rows, (acc, r) => acc + r.price, 0)
  const count = rx.reduce(rows, (acc, r) => acc + 1, 0)
  const avg = rx.average(ids)
  const unique = rx.unique(ids)
  const compact = rx.compact(tags)
  const flat = rx.flatten(nested)
  const some = rx.some(rows, (r) => r.price > 2)
  const every = rx.every(rows, (r) => r.price > 2)
  const found = rx.find(rows, (r) => r.id === 1)
  const lo = rx.min(ids)
  const hi = rx.max(ids)
  const top = rx.take(rx.reverse(ids), 2)
  const rest = rx.skip(ids, 1)
  const head = rx.takeWhile(ids, (n) => n > 2)
  const tail = rx.dropWhile(ids, (n) => n > 2)
  const firstId = rx.first(ids)
  const lastId = rx.last(ids)
  return (
    <Stack>
      <For each={cheap()} by={(r) => r.id}>{(r) => <Text>{r.tag ?? 'none'}</Text>}</For>
      <Text>{String(total() + count() + avg() + unique().length + compact().length + flat().length)}</Text>
      <Text>{some() && every() ? 'y' : found()?.tag ?? 'n'}</Text>
      <Text>{String((lo() ?? 0) + (hi() ?? 0) + top().length + rest().length + head().length + tail().length + (firstId() ?? 0) + (lastId() ?? 0))}</Text>
    </Stack>
  )
}
