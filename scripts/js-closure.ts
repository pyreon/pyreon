/**
 * js-closure — the gzipped size of built JavaScript files and everything they
 * statically import. The one measuring routine behind both route gates: a
 * zero route's first-load JS (`zero-app-checks`) and the shell of a
 * pyreon.dev page (`check-site-budgets`).
 *
 * Dynamic `import()` is deferred work and is not followed.
 *
 * No Bun API, so tests can import it.
 */
import { dirname, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { readTextIfExists } from './fs-read'

/** Relative static-import specifiers of a (minified) ES module. */
export function staticImports(code: string): string[] {
  const out: string[] = []
  // `import x from "./a.js"`, `import{a}from"./a.js"`, `import"./a.js"`,
  // `export{a}from"./a.js"`, `export*from"./a.js"` — never `import(`.
  const re = /\b(?:import|export)\b(?!\s*\()[^'"`;]*?["'`](\.{1,2}\/[^"'`]+?\.m?js)["'`]/g
  for (const m of code.matchAll(re)) out.push(m[1] as string)
  return out
}

/** Gzip -9 bytes of `code`, with `checkoutRoot` (when given) removed first. */
export function gzipBytes(code: string, checkoutRoot?: string): number {
  return gzipSync(checkoutRoot ? code.replaceAll(checkoutRoot, '') : code, { level: 9 }).length
}

/**
 * Gzipped bytes of `entries` (absolute paths) and their static import closure.
 *
 * `checkoutRoot`, when given, is removed from the code before it is measured:
 * a size that depends on where the repository is checked out is not a property
 * of the code, and the base of a pull request is necessarily built in a
 * different directory than its head. `missing` names the referrer in the error
 * for a file that does not exist.
 */
export function closureGzip(
  entries: readonly string[],
  checkoutRoot?: string,
  missing: (file: string) => string = (file) => `[js-closure] missing ${file}`,
): { bytes: number; files: number } {
  const seen = new Set<string>()
  const queue = [...entries]
  let bytes = 0
  while (queue.length > 0) {
    const f = queue.pop() as string
    if (seen.has(f)) continue
    seen.add(f)
    const raw = readTextIfExists(f)
    if (raw === undefined) throw new Error(missing(f))
    bytes += gzipBytes(raw, checkoutRoot)
    for (const spec of staticImports(raw)) queue.push(resolve(dirname(f), spec))
  }
  return { bytes, files: seen.size }
}
