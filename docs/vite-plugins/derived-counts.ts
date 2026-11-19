import type { Plugin } from 'vite'
import { type DerivedCounts, derived, resolveDerived } from '../src/site/derived'

/**
 * Resolves the `{{@key}}` placeholders of the site content (`src/site/derived.ts`: the JSON files and the typed
 * `extra-sections*.ts`) as each file is imported, before any other plugin reads it. Listed first in `vite.config.ts` and in the unit tests' config, so a
 * page, a test and the build all see the same numbers.
 */
const CONTENT = /\/src\/site\/content\/.+(?<!\.check)\.(json|ts)$/

export default function derivedCounts(counts: () => DerivedCounts = derived): Plugin {
  return {
    name: 'pyreon-docs-derived-counts',
    enforce: 'pre',
    transform(code, id) {
      const path = id.split('?')[0] ?? id
      if (!CONTENT.test(path) || !code.includes('{{@')) return null
      return { code: resolveDerived(code, counts(), path.slice(path.indexOf('/src/site/content/') + 1)), map: null }
    },
  }
}
