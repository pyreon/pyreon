import { h } from '@pyreon/core'
import { island } from '@pyreon/zero'

// Islands-in-zero demo route (target of the `zero-islands` e2e gate). The
// island is declared with the zero-native API — `import { island } from
// "@pyreon/zero"` (no @pyreon/server dependency, no server-barrel leak) — and
// the entry-client is just `startClient({ routes })`. The island self-hydrates
// on mount per its `data-hydrate` strategy; no manual `hydrateIslandsAuto`.
const IslandProbe = island(() => import('../components/IslandProbe'), {
  name: 'IslandProbe',
  hydrate: 'visible',
})

export default function IslandDemoPage() {
  return h('div', { 'data-testid': 'island-demo-page' },
    h('h1', null, 'Islands in Zero'),
    h('p', null, 'The button below is a hydrate:"visible" island declared via @pyreon/zero.'),
    h(IslandProbe, null),
  )
}

export const meta = {
  title: 'Island Demo — SSR Showcase',
}
