/**
 * Write the WebP variants of every blog cover (`public/blog/covers/<slug>.png`
 * → `<slug>-800.webp`, `<slug>-1600.webp`), the sizes `src/blog/cover.ts`
 * expects. Run after adding a cover; needs `cwebp` (libwebp) on the PATH.
 *
 *   bun scripts/blog-cover-variants.ts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { COVER_WIDTHS } from '../src/blog/cover'

const dir = resolve(import.meta.dir, '../public/blog/covers')
let written = 0
for (const file of readdirSync(dir).filter((f) => f.endsWith('.png'))) {
  const slug = file.slice(0, -4)
  for (const width of COVER_WIDTHS) {
    const out = join(dir, `${slug}-${width}.webp`)
    if (existsSync(out)) continue
    execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-resize', String(width), '0', join(dir, file), '-o', out])
    written++
  }
}
process.stdout.write(`Wrote ${written} cover variant(s) in public/blog/covers/.\n`)
