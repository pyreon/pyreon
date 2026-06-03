// Tier-2 verification fixture for @pyreon/rx.
//
// Verifies that PMTC can compile real rx.* API calls — rx.filter,
// rx.sortBy, rx.take, rx.pipe, rx.count. This is the honest test:
// users write `rx.filter(signal, predicate)` and expect it to work
// on all 3 targets.
//
// If PMTC can't resolve the `rx` symbol (which it likely can't, since
// it's a third-party export not in the compiler's known-imports
// table), this fixture surfaces the gap as a real compiler bug —
// the kind of "Tier-2 doesn't work in practice" finding the audit
// classification was meant to expose.

import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'

interface Todo {
  id: number
  title: string
  done: boolean
  priority: number
}

export function RxProbe() {
  const todos = signal<Todo[]>([])

  const active = rx.filter(todos, (t: Todo) => !t.done)
  const sortedByPriority = rx.sortBy(active, 'priority' as const)
  const top5 = rx.take(sortedByPriority, 5)
  const activeCount = rx.count(active)
  const avgPriority = rx.average(rx.map(active, (t: Todo) => t.priority))

  return null
}
