import type { CompilerPlugin } from './plugin'
import { servicesPlugin } from './plugins/services'

/** Compiler-shipped plugins; a discovered plugin of the same name replaces one. */
export const BUILT_IN_PLUGINS: readonly CompilerPlugin[] = Object.freeze([servicesPlugin])
