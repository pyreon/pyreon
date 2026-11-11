import type { Plugin } from 'vite'
import { highlight } from './product-content'

/**
 * Highlights the code on the docs home at BUILD time, like
 * `product-content.ts` does for product files: `src/site/content/_docs-home.json`
 * gets `whyFast.code.html` and `whyFast.compiled.html` (Shiki, both themes as
 * CSS variables) next to the original `source` strings, which stay for the
 * copy button and the tests. No highlighter ships to the browser.
 */
const DOCS_HOME_JSON = /\/src\/site\/content\/_docs-home\.json$/

type Json = Record<string, unknown>

/** Adds the `html` siblings. Exported for tests. */
export async function highlightDocsHome(data: Json): Promise<Json> {
  const why = data.whyFast as { code?: Json; compiled?: Json } | undefined
  for (const block of [why?.code, why?.compiled]) {
    if (block && typeof block.source === 'string') {
      // product-content's highlighter loads tsx/typescript/bash/json; plain JS reads as TypeScript.
      const lang = block.lang === 'js' ? 'typescript' : typeof block.lang === 'string' ? block.lang : 'tsx'
      block.html = await highlight(block.source, lang)
    }
  }
  return data
}

export default function docsHomeContent(): Plugin {
  return {
    name: 'pyreon-docs-home-content',
    enforce: 'pre',
    async transform(code, id) {
      const path = id.split('?')[0] ?? id
      if (!DOCS_HOME_JSON.test(path)) return null
      let data: Json
      try {
        data = JSON.parse(code) as Json
      } catch (err) {
        throw new Error(`[Pyreon] docs home content ${path} is not valid JSON: ${(err as Error).message}`)
      }
      return { code: JSON.stringify(await highlightDocsHome(data)), map: null }
    },
  }
}
