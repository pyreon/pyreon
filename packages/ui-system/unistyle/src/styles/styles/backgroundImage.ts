/**
 * Turns a `backgroundImage` theme value into a valid `background-image`
 * value.
 *
 * Only a bare path or URL (`'/img/a.png'`, `'https://…/a.png'`) is wrapped in
 * `url(…)`. Anything that is already a CSS `<image>` passes through verbatim:
 * gradient functions (including `repeating-*`, `conic-*` and `-webkit-`
 * prefixed forms), `url()`, `image()`, `image-set()`, `cross-fade()`,
 * `element()`, `paint()`, `var()` / `env()` references (what every value
 * becomes under `cssVariables` / rocketstyle `mode(a, b)`), `none` and the
 * CSS-wide keywords. A comma-separated layer list is handled per layer, so
 * `'/a.png, linear-gradient(…)'` wraps only the path.
 *
 * Wrapping an `<image>` in `url()` produces `url(linear-gradient(…))`, which
 * the browser rejects: the declaration is dropped and the computed value is
 * `none`, silently.
 */

const IMAGE_FUNCTION =
  /^(?:-(?:webkit|moz|o)-)?(?:url|image|image-set|cross-fade|element|paint|var|env|(?:repeating-)?(?:linear|radial|conic)-gradient)\s*\(/i

const IMAGE_KEYWORD = /^(?:none|inherit|initial|unset|revert|revert-layer)$/i

const isImageLayer = (layer: string): boolean =>
  IMAGE_FUNCTION.test(layer) || IMAGE_KEYWORD.test(layer)

/** Splits on commas outside parentheses and quotes. */
const splitLayers = (value: string): string[] => {
  const layers: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (quote) {
      if (ch === quote && value[i - 1] !== '\\') quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === ',' && depth === 0) {
      layers.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  layers.push(value.slice(start).trim())
  return layers
}

const backgroundImageValue = (raw: unknown): string => {
  const layers = splitLayers(String(raw).trim())
  const out: string[] = []
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i] as string
    if (!layer) continue
    // A bare `data:` URI may itself contain commas (`data:image/png;base64,…`),
    // so it swallows every remaining segment.
    if (/^data:/i.test(layer)) {
      out.push(`url(${layers.slice(i).join(',')})`)
      break
    }
    out.push(isImageLayer(layer) ? layer : `url(${layer})`)
  }
  return out.join(', ')
}

export default backgroundImageValue
