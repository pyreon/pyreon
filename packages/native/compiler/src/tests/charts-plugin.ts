// The chart tests load the first-party plugins through the shared helper (`first-party-plugins.ts`):
// with every first-party plugin loaded the emit matches what the compiler produced when the libraries
// were built in. This file keeps the names the chart tests import.
import { firstPartyCompiler } from './first-party-plugins'

export {
  chartsPlugin,
  chartsStubs,
  transform,
  validateKotlin,
  validateKotlinFiles,
  validateSwiftFilesWithStubs,
  validateSwiftWithStubs,
} from './first-party-plugins'

/** A compiler with the first-party plugins loaded (the charts plugin among them). */
export const chartsCompiler = firstPartyCompiler
