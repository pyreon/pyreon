import type { CompilerPlugin } from './plugin'
import { chartsPlugin } from './plugins/charts'
import { coolgridPlugin } from './plugins/coolgrid'
import { elementsPlugin } from './plugins/elements'
import { servicesPlugin } from './plugins/services'

/** Compiler-shipped plugins; a discovered plugin of the same name replaces one. */
export const BUILT_IN_PLUGINS: readonly CompilerPlugin[] = Object.freeze([
  chartsPlugin,
  servicesPlugin,
  elementsPlugin,
  coolgridPlugin,
])
