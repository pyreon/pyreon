import { lazySlot } from '../docs-ui/sell/lazy-slot'

/** `<InlineSell id="validation" />` — one row for another product, at most one per page (`docs-ui/sell/InlineSell.tsx`). Loads on the pages that use it. */
export const InlineSell = lazySlot<{ id: string }>(() => import('../docs-ui/sell/InlineSell'))
