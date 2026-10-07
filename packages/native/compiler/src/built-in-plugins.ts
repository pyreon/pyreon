import type { CompilerPlugin } from './plugin'

/**
 * Compiler-shipped plugins; a discovered plugin of the same name replaces one. NONE ship: every library (including
 * `@pyreon/hooks`, whose plain-service table the compiler used to carry as a generated copy) owns its lowering in its own
 * package and is discovered from the app's declared dependencies, so a bare `transform()` lowers only the core's own
 * authoring contract. The `builtIn` mechanism stays — a future compiler-shipped plugin registers here.
 */
export const BUILT_IN_PLUGINS: readonly CompilerPlugin[] = Object.freeze([])
