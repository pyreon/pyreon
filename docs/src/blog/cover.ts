/**
 * Blog covers are 1600×840 PNGs in `public/blog/covers/` (the share image of
 * each post: social sites want a PNG). On the page the featured post shows its
 * cover as WebP at two widths, written next to the PNG by
 * `scripts/blog-cover-variants.ts`; `cover.test.ts` fails when a post's cover
 * has no variants.
 */
export const COVER_WIDTHS = [800, 1600] as const

/** The WebP width variants of a cover PNG, or `null` for a cover outside `/blog/covers/`. */
export function coverVariants(src: string): { width: number; src: string }[] | null {
  const m = /^\/blog\/covers\/([a-z0-9-]+)\.png$/.exec(src)
  if (!m) return null
  return COVER_WIDTHS.map((width) => ({ width, src: `/blog/covers/${m[1]}-${width}.webp` }))
}
