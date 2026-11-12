import type { Plugin } from 'vite'

/**
 * Puts the site's one hand-written global stylesheet (tokens.css) into the
 * CSS cascade layer `docs`, BELOW the UI system's layers. (styles/docs-v3.css opens its own `@layer docs` block.)
 *
 * Why: @pyreon/styler emits every kit component into `@layer elements` /
 * `@layer rocketstyle`, and unlayered CSS always beats layered CSS whatever
 * its specificity. These files set bare elements (`body`, `a`, `h1`), so left
 * unlayered they would override what the kit sets on the pages that load
 * them. In one layer the files keep their order among themselves and the kit
 * wins over them.
 *
 * The order statement `@layer docs, elements, rocketstyle;` is the first
 * style in index.html, so the layers are ordered before any of them appears.
 */
const LAYERED = [/\/docs\/src\/styles\/tokens\.css$/]

export default function legacyCssLayer(): Plugin {
  return {
    name: 'pyreon-docs-legacy-css-layer',
    enforce: 'pre',
    transform(code, id) {
      const [path = id, query = ''] = id.split('?')
      if (!LAYERED.some((re) => re.test(path))) return null
      // A `?url` import is the JS module that exports the asset URL; the
      // stylesheet itself comes through here again as CSS.
      if (/(?:^|&)url\b/.test(query)) return null
      if (/^\s*@(?:import|charset)\b/m.test(code)) {
        throw new Error(
          `[Pyreon] legacy-css-layer: ${path} has an @import/@charset, which cannot sit inside @layer. Inline it or import it separately.`,
        )
      }
      return { code: `@layer docs {\n${code}\n}\n`, map: null }
    },
  }
}
