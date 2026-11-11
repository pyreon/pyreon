import { lazySlot } from '../docs-ui/sell/lazy-slot'

/** `<ProductPitch id="form" />` — the pitch strip that opens a product overview (`docs-ui/sell/ProductPitch.tsx`). Loads on the pages that use it. */
export const ProductPitch = lazySlot<{ id: string }>(() => import('../docs-ui/sell/ProductPitch'))
