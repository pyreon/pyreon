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
 * THREE consumers must derive IDENTICALLY, so the derivation itself lives in
 * `@pyreon/compiler` (`island-naming.ts` — the lowest shared layer) and this
 * module re-exports it:
 *  - `injectIslandNames` (transform hook, here) — rewrites the source so the
 *    RUNTIME `island()` call receives the name.
 *  - `scanIslandDeclarations` (auto-registry prescan + transform rescan,
 *    here) — reads raw source from disk, so it re-derives the same way.
 *  - `@pyreon/compiler`'s `generateContext` project scanner — reports each
 *    island under the name the hydration registry ACTUALLY uses.
 * The identity parity test in `tests/island-auto-name.test.ts` locks against
 * a local copy ever being reintroduced here.
 *
 * Bindingless nameless calls (`<X client:… />`-style inline `island(...)`
 * expressions) stay unnamed — the runtime throws with guidance, because
 * there is nothing stable to derive from.
 */
import { deriveIslandName, fnv1a6, islandRelPath } from '@pyreon/compiler'
import { islandCallOffsets } from './ast-rewrite'
import { applyEdits, type TextEdit } from './source-map-chain'

export { deriveIslandName, fnv1a6, islandRelPath }

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
 * Returns the rewritten source, or null when nothing changed.
 */
export function injectIslandNames(code: string, absPath: string, root: string): string | null {
  const edits = islandNameEdits(code, absPath, root)
  return edits.length > 0 ? applyEdits(code, edits).toString() : null
}

/**
 * The insertions `injectIslandNames` makes, as positioned edits on `code`, so
 * the transform hook can map them (`SourceMapChain`). Each one is an inline
 * insertion inside the call: no line moves, and only the text after it on
 * that line shifts.
 */
export function islandNameEdits(code: string, absPath: string, root: string): TextEdit[] {
  if (!code.includes('island')) return []
  const relPath = islandRelPath(root, absPath)
  const callOffsets = islandCallOffsets(code, absPath)
  const edits: TextEdit[] = []

  ISLAND_WITH_OPTS_RE.lastIndex = 0
  for (const m of code.matchAll(ISLAND_WITH_OPTS_RE)) {
    const [, binding, varName, head = '', opts = ''] = m
    const offset = m.index
    if (!binding || !varName || !callOffsets.has(offset + binding.length)) continue
    if (HAS_NAME_RE.test(opts)) continue
    const name = deriveIslandName(varName, relPath)
    // opts usually starts with the user's own whitespace — don't double it
    const sep = opts.trim().length > 0 && !/^\s/.test(opts) ? ' ' : ''
    const at = offset + binding.length + head.length
    edits.push({ start: at, end: at, text: ` name: ${JSON.stringify(name)},${sep}` })
  }

  for (const m of code.matchAll(ISLAND_NO_OPTS_RE)) {
    const [, binding = '', varName = '', head = ''] = m
    const offset = m.index
    if (!callOffsets.has(offset + binding.length)) continue
    const name = deriveIslandName(varName, relPath)
    const at = offset + binding.length + head.length
    edits.push({ start: at, end: at, text: `, { name: ${JSON.stringify(name)} }` })
  }

  return edits
}
