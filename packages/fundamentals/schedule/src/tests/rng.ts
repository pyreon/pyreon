/** Seeded generator (mulberry32) so a failing differential case reproduces from its seed. */
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

