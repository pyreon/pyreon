/**
 * Island auto-naming — Tier-3 islands DX.
 *
 * `island()` historically REQUIRED a manual `name` that must match the
 * registry key exactly; a typo failed silently at runtime (the #1 islands
 * foot-gun after the auto-registry landed). The name is mechanical: the
 * const binding already names the island. This module derives it.
 *
 *   const Counter = island(() => import('./Counter'), { hydrate: 'load' })
 *   // → name: 'Counter$<fnv1a6(relPath)>'
 *
 * The file-hash suffix makes derived names COLLISION-FREE by construction
 * (two files can both bind `Counter`), which the manual-name world could
 * never guarantee (duplicate names fail silently; the islands audit merely
 * detects them after the fact). Explicit `name:` always wins — it stays
 * the pretty, human-chosen identifier.
 *
 * Two consumers must derive IDENTICALLY (both live in this plugin):
 *  - `injectIslandNames` (transform hook) — rewrites the source so the
 *    RUNTIME `island()` call receives the name.
 *  - `scanIslandDeclarations` (auto-registry prescan + transform rescan) —
 *    reads raw source from disk, so it re-derives with the same helper.
 *
 * Bindingless nameless calls (`<X client:… />`-style inline `island(...)`
 * expressions) stay unnamed — the runtime throws with guidance, because
 * there is nothing stable to derive from.
 */
import { relative } from 'node:path'

/** FNV-1a 32-bit, base36, first 6 chars — same family as the styler's hash. */
export function fnv1a6(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).slice(0, 6)
}

/** Normalize an absolute module id to a root-relative, forward-slash path. */
export function islandRelPath(root: string, absPath: string): string {
  return relative(root, absPath).replace(/\\/g, '/')
}

/** The one derivation both the injector and the scanners use. */
export function deriveIslandName(varName: string, relPath: string): string {
  return `${varName}$${fnv1a6(relPath)}`
}

// Optional binding capture + the same call shape the registry scanners use.
// Group 1: const-binding name (optional), group 2: import path, group 3:
// options block (may be empty for the no-options form via ISLAND_NO_OPTS_RE).
const ISLAND_WITH_OPTS_RE =
  /((?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*)?(island\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"][^'"]+['"]\s*\)\s*,\s*\{)([^}]{0,500})(\})/g

const ISLAND_NO_OPTS_RE =
  /((?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*)(island\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"][^'"]+['"]\s*\))(\s*\))/g

const HAS_NAME_RE = /(?:^|[\s,{])name\s*:/

/**
 * Inject derived `name:` into nameless, const-bound `island()` calls.
 * Returns the rewritten source, or null when nothing changed. Inline
 * (single-line) insertion — line positions are preserved so downstream
 * source maps only drift by columns on the affected lines.
 */
export function injectIslandNames(code: string, absPath: string, root: string): string | null {
  if (!code.includes('island')) return null
  const relPath = islandRelPath(root, absPath)
  let changed = false

  let out = code.replace(
    ISLAND_WITH_OPTS_RE,
    (full, binding: string | undefined, varName: string | undefined, head: string, opts: string, close: string) => {
      if (!binding || !varName) return full
      if (HAS_NAME_RE.test(opts)) return full
      changed = true
      const name = deriveIslandName(varName, relPath)
      // opts usually starts with the user's own whitespace — don't double it
      const sep = opts.trim().length > 0 && !/^\s/.test(opts) ? ' ' : ''
      return `${binding}${head} name: ${JSON.stringify(name)},${sep}${opts}${close}`
    },
  )

  out = out.replace(
    ISLAND_NO_OPTS_RE,
    (full, binding: string, varName: string, head: string, close: string) => {
      changed = true
      const name = deriveIslandName(varName, relPath)
      return `${binding}${head}, { name: ${JSON.stringify(name)} }${close}`
    },
  )

  return changed ? out : null
}
