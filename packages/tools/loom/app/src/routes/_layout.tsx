import { RouterView } from '@pyreon/router'

/**
 * The shell is the view itself — each route renders a full `<Observatory>`
 * seeded with its own view id (see `view.tsx`). The layout stays a bare
 * passthrough so a prerendered page is self-contained: open any URL directly
 * and you get that view, with no client-side view negotiation.
 */
export function layout() {
  return <RouterView />
}
