import { hydrateIslands } from '@pyreon/server/client'

// The keys here MUST match each island's `name` in src/islands.ts.
// Islands not listed here log a "no loader registered" warning and stay un-hydrated.
hydrateIslands({
  Counter: () => import('./components/Counter'),
  IdleClock: () => import('./components/IdleClock'),
  VisibleComments: () => import('./components/VisibleComments'),
  MobileMenu: () => import('./components/MobileMenu'),
  // StaticBadge has hydrate: 'never' — registering it would still skip hydration
  // (the strategy short-circuits before the loader runs), but omitting it makes
  // the intent explicit AND ensures the StaticBadge module isn't pulled into the
  // client graph at all.
})
