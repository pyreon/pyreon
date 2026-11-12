/**
 * WCAG 2.x contrast for theme colours, with alpha. A colour with alpha is
 * composited over what is behind it first, the way the browser paints it:
 * `primary[100]` over the page, then the text over that.
 */

type Rgba = readonly [number, number, number, number]

export const parseColor = (color: string): Rgba => {
  const c = color.trim()
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1)
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
      1,
    ]
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(c)
  if (!m) throw new Error(`[Pyreon] contrast test: cannot parse colour "${color}"; use #rrggbb or rgb()/rgba()`)
  const [r = 0, g = 0, b = 0, a = 1] = m[1]!.split(',').map((s) => Number.parseFloat(s))
  return [r, g, b, a]
}

/** Paint `top` over an opaque `bottom`. */
const over = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3]
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ]
}

const channel = (v: number): number => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

const luminance = (c: Rgba): number =>
  0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2])

/**
 * Contrast of `text` drawn on `surface`, where `surface` is painted on `page`
 * (an opaque colour). Pass `surface === page` for text directly on the page.
 */
export const contrast = (text: string, surface: string, page: string): number => {
  const bg = over(parseColor(surface), parseColor(page))
  const fg = over(parseColor(text), bg)
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
