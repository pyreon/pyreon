import type { Plugin } from 'vite'

/**
 * Puts the site's hand-written stylesheets (tokens.css, docs.css,
 * site-pages.css and zero-content's blog.css) into one CSS cascade layer,
 * `docs`, BELOW the UI system's layers.
 *
 * Why: @pyreon/styler emits every kit component into `@layer elements` /
 * `@layer rocketstyle`, and unlayered CSS always beats layered CSS whatever
 * its specificity. docs.css opens with `* { margin: 0; padding: 0 }` and sets
 * `a`, `h1–h6`, `p`, `ul`, `code`, `pre` globally, so left unlayered it would
 * erase every padding and margin the kit sets on the pages that load both
 * (the marketing shell wraps the blog and the showcase). In one layer the
 * files keep their order among themselves and the kit wins over them.
 *
 * The order statement `@layer docs, elements, rocketstyle;` is the first
 * style in index.html, so the layers are ordered before any of them appears.
 */
const LAYERED = [
  /\/docs\/src\/styles\/(?:tokens|docs|site-pages)\.css$/,
  /\/zero-content\/styles\/blog\.css$/,
]

export default function legacyCssLayer(): Plugin {
  return {
    name: 'pyreon-docs-legacy-css-layer',
    enforce: 'pre',
    transform(code, id) {
      const [path = id, query = ''] = id.split('?')
      if (!LAYERED.some((re) => re.test(path))) return null
      // `docs.css?url` (the docs layout's link) is the JS module that exports
      // the asset URL; the stylesheet itself comes through here again as CSS.
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
