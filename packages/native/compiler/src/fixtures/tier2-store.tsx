// Tier-2 Strategy-B v1 fixture for @pyreon/store (Gap 4 PR-4).
//
// v1 scope verified:
//   - defineStore("id", () => { const X = signal(...); return { X } })
//   - Use-site chain rewriting: useFoo().store.X → PyreonStore_foo.X
//   - Multiple signals in one store
//   - String + number signal types
//
// Deferred (documented follow-ups, each its own PR):
//   - Computeds in setup body
//   - Methods in setup body
//   - patch({ ... }) batched updates
//   - subscribe(listener) watchers
//   - Destructure use form: const { store, patch } = useCounter()

import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'

const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const label = signal('counter')
  return { count, label }
})

export function CounterView() {
  return (
    <Stack>
      <Text>{useCounter().store.label()}</Text>
      <Text>Count: {useCounter().store.count()}</Text>
      <Button onPress={() => useCounter().store.count.set(useCounter().store.count() + 1)}>
        Increment
      </Button>
    </Stack>
  )
}
