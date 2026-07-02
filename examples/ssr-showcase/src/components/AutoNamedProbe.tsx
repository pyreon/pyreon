import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

// Target of the AUTO-NAMED island e2e (see routes/island-demo.tsx — its
// island() declaration passes NO `name`; @pyreon/vite-plugin derives one
// from the const binding). Same signal-counter shape as IslandProbe so the
// spec proves hydration + reactivity for the derived-name path.
export default function AutoNamedProbe() {
  const count = signal(0)
  return h(
    'button',
    {
      'data-testid': 'auto-island-probe',
      type: 'button',
      onClick: () => count.set(count() + 1),
    },
    () => `auto island clicks: ${count()}`,
  )
}
