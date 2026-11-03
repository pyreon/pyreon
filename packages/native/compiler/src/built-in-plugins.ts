import { intlPlugin } from './intl-plugin'
import type { CompilerPlugin } from './plugin'

/**
 * Compiler-shipped plugins; a discovered plugin of the same name replaces one. No LIBRARY ships here: every library
 * (including `@pyreon/hooks`, whose plain-service table the compiler used to carry as a generated copy) owns its lowering
 * in its own package and is discovered from the app's declared dependencies.
 *
 * What does ship is the JavaScript LANGUAGE's own surface that has no package to be discovered from: `Intl` (see
 * `intl-plugin.ts`). It is part of the core authoring contract the same way `Math` and `Date.now()` are, and it is a
 * plugin rather than parser code because the plugin seams (`callExprs`, `methodCalls`, `exprs`) are exactly the shape it
 * needs.
 */
export const BUILT_IN_PLUGINS: readonly CompilerPlugin[] = Object.freeze([intlPlugin])
