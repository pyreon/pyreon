import { lazySlot } from '../docs-ui/sell/lazy-slot'

/** `<ComingFrom id="form" lib="React Hook Form" />` — the same code before and after (`docs-ui/sell/ComingFrom.tsx`). Loads on the pages that use it. */
export const ComingFrom = lazySlot<{ id: string; lib?: string }>(() => import('../docs-ui/sell/ComingFrom'))
