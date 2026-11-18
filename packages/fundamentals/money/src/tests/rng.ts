/** Seeded generator (mulberry32): a failing case reproduces from its seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0

  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a

    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rand = () => number

export const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1))

export const pick = <T>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!

/** A random decimal string with `fracDigits` fraction digits and up to `intDigits` integer digits; ties (a trailing 5) are common. */
export function decimal(r: Rand, intDigits = 6, fracDigits = 4): string {
  const ints = int(r, 1, intDigits)
  let head = String(int(r, 1, 9))

  for (let i = 1; i < ints; i++) head += String(int(r, 0, 9))
  if (r() < 0.2) head = '0'
  const frac = int(r, 0, fracDigits)
  let tail = ''

  for (let i = 0; i < frac; i++) tail += String(i === frac - 1 && r() < 0.4 ? 5 : int(r, 0, 9))
  const body = tail === '' ? head : `${head}.${tail}`

  return r() < 0.4 ? `-${body}` : body
}

export const ROUNDING_MODES = ['ceil', 'floor', 'expand', 'trunc', 'halfCeil', 'halfFloor', 'halfExpand', 'halfTrunc', 'halfEven'] as const
