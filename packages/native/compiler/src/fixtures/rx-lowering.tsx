// RX-1 lowering proof fixture.
//
// Exercises the v1 supported set (rx.filter / rx.map / rx.reverse) —
// native methods with identical names on Swift `[T]` + Kotlin `List<T>`.
// The compiler's `tryRxNamespaceLowering` rewrites each into a `computed`
// IR whose body is the underlying native call; the existing computed
// emit path produces idiomatic Swift / Kotlin.
//
// Inline object-shaped signal type (`signal<{ ... }[]>`) is used instead
// of a named `interface Todo` so PMTC synthesises a `data class
// RxLowerProbeItem` for Kotlin — same shape every other fixture uses.

import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

export function RxLowerProbe() {
  const todos = signal<{ id: number; title: string; done: boolean; priority: number }[]>([])
  const active = rx.filter(todos, (t) => !t.done)
  const priorities = rx.map(active, (t) => t.priority)
  const reversed = rx.reverse(active)
  // The bindings are load-bearing for the RX-1 lowering — PMTC's
  // `tryRxNamespaceLowering` only fires on `const X = rx.METHOD(...)`
  // declarators, so the bindings can't be replaced with bare
  // expression statements (the way the silent-drop fixture is shaped).
  // Void discards satisfy oxlint's no-unused-vars without changing the
  // declarator shape PMTC walks.
  void active
  void priorities
  void reversed
  return null
}
