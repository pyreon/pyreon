import { lazySlot } from '../docs-ui/sell/lazy-slot'

/** `<LiveDemo id="form" />` — the product demo with Preview / Code tabs (`docs-ui/sell/LiveDemo.tsx`). Loads on the pages that use it. */
export const LiveDemo = lazySlot<{ id: string }>(() => import('../docs-ui/sell/LiveDemo'))
