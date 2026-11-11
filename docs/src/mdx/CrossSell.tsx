import { lazySlot } from '../docs-ui/sell/lazy-slot'

/** `<CrossSell id="form" />` or `<CrossSell ids="query,store" />` — "Learn more" cards (`docs-ui/sell/CrossSell.tsx`). Loads on the pages that use it. */
export const CrossSell = lazySlot<{ id?: string; ids?: string | string[] }>(() => import('../docs-ui/sell/CrossSell'))
