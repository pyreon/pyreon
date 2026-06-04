import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

// Island target — a signal-backed counter. Proves an island in a @pyreon/zero
// app (a) hydrates and (b) has working reactivity after hydration (the Bug 3/F
// "Cannot read properties of undefined (reading 'ref')" crash was the dual
// @pyreon/core instance; a single instance → the signal click works).
export default function IslandProbe() {
  const count = signal(0)
  return h(
    'button',
    {
      'data-testid': 'island-probe',
      type: 'button',
      onClick: () => count.set(count() + 1),
    },
    () => `island clicks: ${count()}`,
  )
}
