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
import { analyzeValidate, emitSchemaSource } from '@pyreon/compiler/validate'
import { applyEdits, type TextEdit } from './source-map-chain'

/** Collision-proof alias prefix for the injected mini imports (`$` keeps it a valid id). */
const ALIAS_PREFIX = '_pv$'

/**
 * Rewrite every emittable `const X = s.<chain>` in `code` to the lean
 * `@pyreon/validate/mini` form. Returns the rewritten source, or `null` when
 * nothing was rewritten (no emittable schema) — the caller leaves `code`
 * untouched in that case.
 */
export function optimizeValidators(code: string, id: string): string | null {
  const edits = optimizeValidatorEdits(code, id)
  return edits === null ? null : applyEdits(code, edits).toString()
}

/**
 * The rewrite `optimizeValidators` makes, as positioned edits on `code` (the
 * schema initializers replaced, the lean imports inserted at the top), so the
 * transform hook can return a source map for it. `null` when nothing changes.
 */
export function optimizeValidatorEdits(code: string, id: string): TextEdit[] | null {
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

  const specifiers = [...usedImports]
    .sort()
    .map((name) => `${name} as ${ALIAS_PREFIX}${name}`)
    .join(', ')
  // `mini` ships without the runtime JIT (`@pyreon/validate/jit`); the
  // chainable source this replaces had it, so keep it — the rewrite changes
  // the bundle, never the validator's speed.
  return [
    {
      start: 0,
      end: 0,
      text:
        `import { ${specifiers} } from '@pyreon/validate/mini';\n` +
        `import { enableJit as ${ALIAS_PREFIX}enableJit } from '@pyreon/validate/jit';\n` +
        `${ALIAS_PREFIX}enableJit();\n`,
    },
    ...edits.map((e) => ({ start: e.start, end: e.end, text: e.lean })),
  ]
}
