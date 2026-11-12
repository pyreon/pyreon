/**
 * WCAG 2.x contrast, pure — used by the theme contrast test and available to
 * the browser audit. Accepts `#rgb`, `#rrggbb` and `rgba(r,g,b,a)`.
 */
export type Rgba = readonly [number, number, number, number]

export function parseColor(input: string): Rgba {
  const s = input.trim()
  if (s.startsWith('#')) {
    const h = s.slice(1)
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), 1]
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (!m) throw new Error(`[Pyreon] atlas: cannot parse colour "${input}" — use #hex or rgb()/rgba().`)
  const parts = m[1]!.split(',').map((x) => Number.parseFloat(x))
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]
}

/** Paint `top` (possibly translucent) over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3]
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ]
}

function channel(c: number): number {
  const x = c / 255
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

export function luminance(c: Rgba): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2])
}

/** The contrast ratio of `fg` over `bg` (a translucent `fg` is composited first). */
export function contrastRatio(fg: string | Rgba, bg: string | Rgba): number {
  const b = typeof bg === 'string' ? parseColor(bg) : bg
  const fRaw = typeof fg === 'string' ? parseColor(fg) : fg
  const f = fRaw[3] < 1 ? composite(fRaw, b) : fRaw
  const l1 = luminance(f)
  const l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
