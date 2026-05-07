import { island } from '@pyreon/server'

// One island per hydration strategy. The `name` field MUST match the key in
// the client-side hydrateIslands() registry — see entry-client.ts.

export const Counter = island(() => import('./components/Counter'), {
  name: 'Counter',
  hydrate: 'load',
})

export const IdleClock = island(() => import('./components/IdleClock'), {
  name: 'IdleClock',
  hydrate: 'idle',
})

export const VisibleComments = island(() => import('./components/VisibleComments'), {
  name: 'VisibleComments',
  hydrate: 'visible',
  // Pre-warm the chunk during browser idle so by the time the island scrolls
  // into view, hydration is instant instead of blank-while-fetching.
  prefetch: 'idle',
})

export const MobileMenu = island(() => import('./components/MobileMenu'), {
  name: 'MobileMenu',
  hydrate: 'media((max-width: 768px))',
})

export const CommandPalette = island(() => import('./components/CommandPalette'), {
  name: 'CommandPalette',
  hydrate: 'interaction',
})

export const StaticBadge = island(() => import('./components/StaticBadge'), {
  name: 'StaticBadge',
  hydrate: 'never',
})
