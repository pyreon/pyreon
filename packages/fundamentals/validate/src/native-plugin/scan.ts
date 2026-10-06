import { topLevelDeclarators, type ModuleScan } from '@pyreon/native-compiler/plugin-api'
import { astContainsInlineValidateSafeParse, extractLiteralFieldMeta, withFieldDeclShape } from './ast'
import { validateFacts } from './facts'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/**
 * The per-file pre-pass. It runs before any declaration is parsed, so it answers two questions
 * SYNTACTICALLY: which names the file binds the `s` namespace to (the recognizers refuse to fire without the
 * import), and whether a schema / `withField` will lower — so the blanket "has NO native lowering" warning is
 * not printed directly above the struct it would deny.
 */
export function scanValidate(scan: ModuleScan): void {
  const facts = validateFacts(scan)
  for (const node of scan.body as readonly AnyNode[]) {
    if (node.type !== 'ImportDeclaration') continue
    if (node.source?.value !== '@pyreon/validate') continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 's') {
        const local = spec.local?.name
        if (typeof local === 'string') facts.names.add(local)
      }
    }
  }

  // `withField`: does some top-level declaration lower? Silent probe — the recognizer itself warns, by name and
  // with the reason, for a `withField` that is shaped right but unlowerable.
  for (const node of scan.body as readonly AnyNode[]) {
    const shape = withFieldDeclShape(node)
    if (!shape) continue
    const { metaArg } = shape
    if (!metaArg || metaArg.type !== 'ObjectExpression') continue
    if (extractLiteralFieldMeta(metaArg).length === 0) continue
    scan.lowered('@pyreon/validate', 'withField')
    break
  }

  if (facts.names.size === 0) return
  let schemaLowered = false
  // Does any top-level declaration actually use the lowered shape?
  for (const node of scan.body as readonly AnyNode[]) {
    for (const d of topLevelDeclarators(node)) {
      const init = d.init as AnyNode | undefined
      const callee = init?.callee as AnyNode | undefined
      if (
        init?.type === 'CallExpression' &&
        callee?.type === 'MemberExpression' &&
        callee.object?.type === 'Identifier' &&
        facts.names.has(callee.object.name as string) &&
        callee.property?.type === 'Identifier' &&
        ((callee.property.name as string) === 'object' || (callee.property.name as string) === 'discriminatedUnion')
      ) {
        schemaLowered = true
        // Record the BINDING so `Pet.safeParse(x)` elsewhere in the file can resolve to its struct. Only the
        // literal-shape object form — the one the recognizer lowers — counts as `object`; a non-literal shape is
        // left out, so its `.safeParse` is never pointed at a struct that was never emitted.
        if (d.id?.type === 'Identifier') {
          const isUnion = (callee.property.name as string) === 'discriminatedUnion'
          const shape = (init.arguments as AnyNode[] | undefined)?.[0]
          if (isUnion || shape?.type === 'ObjectExpression') {
            facts.bindings.set(d.id.name as string, isUnion ? 'union' : 'object')
          }
        }
      }
    }
  }
  // An INLINE `s.object({ … }).safeParse(x)` anywhere in the tree (inside a computed / component body) ALSO
  // lowers, so the blanket `s` warning must be suppressed for it too.
  if (astContainsInlineValidateSafeParse(scan.body as unknown as AnyNode, facts.names)) schemaLowered = true
  if (schemaLowered) scan.lowered('@pyreon/validate', 's')
}
