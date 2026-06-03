// Tier-2 verification fixture for @pyreon/rx.
//
// Verifies that PMTC can compile real rx.* API calls — rx.filter,
// rx.sortBy, rx.take, rx.average, rx.count, rx.map. This is the honest
// test: users write `rx.filter(signal, predicate)` and expect it to
// work on all 3 targets.
//
// PMTC's actual behaviour: silently drops every rx.* call from the
// emitted Swift/Kotlin output. Regression-locked by
// tier2-rx-silent-drop.test.ts.
//
// Style note: the rx.* calls are written as bare expression statements
// (not const-bound). The const-bound version triggers no-unused-vars /
// unused-variable lint findings since PMTC drops the bindings anyway —
// making the bindings cosmetic noise the lint tooling correctly flags.
// The bare-expression form preserves the test signal (the rx.* call
// sites still appear in the source the PMTC walker sees) without the
// lint friction.

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

  // Bare expression statements — PMTC walks the function body and
  // would emit these IF it recognised the rx.* namespace. It doesn't.
  rx.filter(todos, (t: Todo) => !t.done)
  rx.sortBy(rx.filter(todos, (t: Todo) => !t.done), 'priority' as const)
  rx.take(rx.sortBy(rx.filter(todos, (t: Todo) => !t.done), 'priority' as const), 5)
  rx.count(rx.filter(todos, (t: Todo) => !t.done))
  rx.average(rx.map(rx.filter(todos, (t: Todo) => !t.done), (t: Todo) => t.priority))

  return null
}
