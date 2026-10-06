/**
 * The scoped slot the moved Kotlin chart emitters read the compiler through —
 * the Kotlin half of `facade.ts`.
 *
 * Compose needs nothing beyond the shared `EmitContext`: a chart host's state
 * is a `remember { … }` inside the composable it emits (there is no
 * component-level declaration list to splice), and the colour scheme is a
 * composable read (`isSystemInDarkTheme()`), not an environment value the
 * component must declare. So there is no `KotlinEmitContext`, and this `host`
 * is exactly the shared members.
 */

import type { EmitContext } from '@pyreon/native-compiler/plugin-api'
import { createContextSlot, sharedHost } from './facade'

const slot = createContextSlot<EmitContext>('Kotlin', 'withKotlinContext')

/** Run `fn` with `ctx` installed as the context the chart emitters read; restore the previous one afterwards. */
export const withKotlinContext = slot.run

/** The facade, read through the slot. */
export const host = Object.freeze(sharedHost(slot.current))
