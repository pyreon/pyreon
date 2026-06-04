// RX — full Strategy-A lowering proof fixture.
//
// Exercises every method in `RX_V1_METHODS` from parse.ts. Each
// `const X = rx.METHOD(...)` is recognised by `tryRxNamespaceLowering`
// and produces a `kind: 'rx-call'` ExprIR; the per-target emit
// dispatch in emit-swift.ts / emit-kotlin.ts produces idiomatic native
// code.
//
// Inline object-shaped signal types are used so PMTC synthesises the
// `data class` shape Kotlin needs (matches existing fixture convention).

import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

export function RxFullProbe() {
  const todos = signal<{ id: number; title: string; done: boolean; priority: number }[]>([])
  const nums = signal<number[]>([])
  const maybeNums = signal<(number | null)[]>([])
  const nested = signal<number[][]>([])

  // Transforms
  const active = rx.filter(todos, (t) => !t.done)
  const priorities = rx.map(active, (t) => t.priority)
  const reversed = rx.reverse(active)
  const compacted = rx.compact(maybeNums)
  const flat = rx.flatten(nested)
  const distinct = rx.unique(nums)

  // Bounded transforms
  const top5 = rx.take(active, 5)
  const restAfterFirst = rx.skip(active, 1)
  const positives = rx.takeWhile(nums, (n) => n > 0)
  const afterNegs = rx.dropWhile(nums, (n) => n < 0)

  // Scalars
  const head = rx.first(active)
  const tail = rx.last(active)
  const found = rx.find(active, (t) => t.id === 1)
  const hasUrgent = rx.some(active, (t) => t.priority > 5)
  const allDone = rx.every(todos, (t) => t.done)

  // Aggregations
  const total = rx.count(active)
  const totalSum = rx.sum(nums)
  const lowest = rx.min(nums)
  const highest = rx.max(nums)
  const folded = rx.reduce(nums, (acc, n) => acc + n, 0)
  const mean = rx.average(nums)

  // Void discards — the bindings are load-bearing for the
  // `tryRxNamespaceLowering` recognition path (only `const X =
  // rx.METHOD(...)` declarators are detected); but the resulting
  // computeds aren't read anywhere in this fixture, so unused-vars
  // would fire without these void discards.
  void active
  void priorities
  void reversed
  void compacted
  void flat
  void distinct
  void top5
  void restAfterFirst
  void positives
  void afterNegs
  void head
  void tail
  void found
  void hasUrgent
  void allDone
  void total
  void totalSum
  void lowest
  void highest
  void folded
  void mean

  return null
}
