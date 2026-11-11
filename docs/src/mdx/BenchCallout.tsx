import { lazySlot } from '../docs-ui/sell/lazy-slot'

/** `<BenchCallout id="form" />` — the product benchmark result (`docs-ui/sell/BenchCallout.tsx`). Loads on the pages that use it. */
export const BenchCallout = lazySlot<{ id: string }>(() => import('../docs-ui/sell/BenchCallout'))
