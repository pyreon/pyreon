import { existsSync, readFileSync } from 'node:fs'
import { dirname, join as pathJoin } from 'node:path'

/**
 * Whether a module id belongs to a `@pyreon/*` package — decided by the
 * nearest `package.json`'s name, so it holds for an npm install
 * (`node_modules/@pyreon/x/lib/…`) and a workspace link (`packages/…/src/…`)
 * alike, and never for the user's own sources. The plugin uses it to fold
 * `process.env.NODE_ENV` in `@pyreon/*` files during production SSR builds;
 * tests reach it through `@pyreon/vite-plugin/internal`.
 *
 * @internal
 */
export function isPyreonPackageFile(
  id: string,
  /** Directory → verdict. The plugin passes one per instance (one build's lifetime). */
  pyreonDirCache: Map<string, boolean> = new Map(),
): boolean {
  const file = id.split('?')[0]!
  if (file.startsWith('\0') || !file.startsWith('/')) return false
  if (file.includes('/node_modules/@pyreon/')) return true
  let dir = dirname(file)
  const visited: string[] = []
  let result = false
  for (;;) {
    const cached = pyreonDirCache.get(dir)
    if (cached !== undefined) {
      result = cached
      break
    }
    visited.push(dir)
    const pkgPath = pathJoin(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const name = (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: unknown }).name
        result = typeof name === 'string' && name.startsWith('@pyreon/')
      } catch {
        result = false
      }
      break
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  for (const d of visited) pyreonDirCache.set(d, result)

  return result
}
