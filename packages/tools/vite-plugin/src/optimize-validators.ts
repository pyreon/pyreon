/**
 * optimize-validators — "function chaining in, tree-shakeable output".
 *
 * Build-time source rewrite: a module-level chainable `const X = s.<chain>`
 * schema is replaced IN PLACE with the equivalent lean `@pyreon/validate/mini`
 * construction, and the lean exports it uses are imported once at module top
 * under a collision-proof alias. The user keeps writing the beautiful chainable
 * API (`s.string().email().min(2)`); the bundle ships
 * `string().check(email(), minLength(2))` and prunes every unused format
 * validator — no second API to import.
 *
 * Pure + conservative, mirroring `compiled-verdicts.ts`:
 *   - `analyzeValidate` only recognizes statically-analyzable `const X = s.<chain>`
 *     schemas; anything dynamic becomes a non-`emittable` IR node and is left
 *     untouched (graceful fallback to the full runtime — correct, just not pruned).
 *   - Verdict + issues are byte-identical to the chainable original (the mini
 *     actions are parity-locked; the end-to-end rewrite is proven by
 *     `@pyreon/validate`'s `tests/compile-rewrite-equivalence.test.ts`).
 *
 * @module
 */
import { analyzeValidate, emitSchemaSource } from '@pyreon/compiler'

/** Collision-proof alias prefix for the injected mini imports (`$` keeps it a valid id). */
const ALIAS_PREFIX = '_pv$'

/**
 * Rewrite every emittable `const X = s.<chain>` in `code` to the lean
 * `@pyreon/validate/mini` form. Returns the rewritten source, or `null` when
 * nothing was rewritten (no emittable schema) — the caller leaves `code`
 * untouched in that case.
 */
export function optimizeValidators(code: string, id: string): string | null {
  // Cheap pre-filter: no `s.` → no chainable schema construction to rewrite.
  if (!code.includes('s.')) return null

  let infos: ReturnType<typeof analyzeValidate>
  try {
    infos = analyzeValidate(code, id)
  } catch {
    return null
  }

  const usedImports = new Set<string>()
  const edits: Array<{ start: number; end: number; lean: string }> = []
  for (const info of infos) {
    // Only fully-emittable schemas (no `unsupported` IR node) are safe to
    // rewrite. `topLevel` is NOT required — overwriting the initializer span
    // is local, and the injected imports sit at module top, in scope everywhere.
    if (!info.emittable) continue
    let lean: string
    let imports: Set<string>
    try {
      ;({ code: lean, imports } = emitSchemaSource(info.node, ALIAS_PREFIX))
    } catch {
      continue // defensive: analyzer marked emittable but emit rejected
    }
    for (const name of imports) usedImports.add(name)
    edits.push({ start: info.start, end: info.end, lean })
  }
  if (edits.length === 0) return null

  // Apply right-to-left so earlier offsets stay valid as we splice.
  edits.sort((a, b) => b.start - a.start)
  let out = code
  for (const e of edits) out = out.slice(0, e.start) + e.lean + out.slice(e.end)

  const specifiers = [...usedImports]
    .sort()
    .map((name) => `${name} as ${ALIAS_PREFIX}${name}`)
    .join(', ')
  return `import { ${specifiers} } from '@pyreon/validate/mini';\n${out}`
}
