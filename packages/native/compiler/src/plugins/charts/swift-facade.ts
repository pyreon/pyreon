/**
 * The scoped slot the moved Swift chart emitters read the compiler through —
 * the Swift half of `facade.ts` (see it for why a slot rather than a parameter).
 *
 * The plugin's `emit.swift(el, ctx)` installs `ctx` here for exactly the
 * duration of the call and every function reads it through {@link host}.
 */

import type { HostStateSlot, SwiftEmitContext } from '../../emit-context'
import type { ExprIR } from '../../types'
import { createContextSlot, sharedHost } from './facade'

const slot = createContextSlot<SwiftEmitContext>('Swift', 'withSwiftContext')

/** Run `fn` with `ctx` installed as the context the chart emitters read; restore the previous one afterwards. */
export const withSwiftContext = slot.run

/** The facade, read through the slot: the shared members plus the Swift-only ones. */
export const host = Object.freeze({
  ...sharedHost(slot.current),
  handlerName: (handler: ExprIR): string | undefined => slot.current().handlerName(handler),
  markColorSchemeUsed: (): void => slot.current().markColorSchemeUsed(),
  get hostState(): HostStateSlot {
    return slot.current().hostState
  },
})
