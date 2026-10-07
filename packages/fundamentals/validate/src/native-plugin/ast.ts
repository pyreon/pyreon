// The AST shapes `@pyreon/validate`'s plugin reads, shared by the pre-pass (which decides, before any
// declaration is parsed, whether the import-warning must stay silent) and the recognizers (which lower). Both
// deciders go through THESE functions — they run at different times, so a hand-copied predicate would be free to
// drift from the one that actually lowers.

import { dynamicKeyText, hasDynamicKey, staticPropKey, unwrapTypeLayers, type ModuleParseContext } from '@pyreon/native-compiler/plugin-api'
import type { FieldMetaDefnIR } from './ir'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/**
 * True when `node` is a `<s>.object({ … }).safeParse(ARG)` CallExpression: a call whose callee is
 * `<schema>.safeParse` and whose `<schema>` is a `<s>.object(<ObjectExpression>)` call with `s` bound to
 * `@pyreon/validate`.
 */
export function isInlineValidateSafeParseCall(node: AnyNode, sNames: ReadonlySet<string>): boolean {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression' || callee.computed) return false
  if (callee.property?.type !== 'Identifier' || callee.property.name !== 'safeParse') return false
  const schemaCall = callee.object as AnyNode | undefined
  if (schemaCall?.type !== 'CallExpression') return false
  const schemaCallee = schemaCall.callee as AnyNode | undefined
  if (schemaCallee?.type !== 'MemberExpression' || schemaCallee.computed) return false
  if (
    schemaCallee.object?.type !== 'Identifier' ||
    !sNames.has(schemaCallee.object.name as string)
  ) {
    return false
  }
  if (schemaCallee.property?.type !== 'Identifier' || schemaCallee.property.name !== 'object') {
    return false
  }
  // v1 lowers a LITERAL object shape only (same as the named `s.object({ … })`
  // path). An `s.object(someVar)` form stays web (warned) rather than being
  // suppressed here and then failing to lower.
  const shapeArg = (schemaCall.arguments as AnyNode[] | undefined)?.[0]
  if (!shapeArg || shapeArg.type !== 'ObjectExpression') return false
  return true
}

/**
 * Deep-walk `node` for an inline `<s>.object(...).safeParse(...)` chain. Used ONLY by the pre-pass, which runs
 * before the body parse that performs the lowering — so it decides suppression syntactically. Structural,
 * allocation-free walk over own object/array properties.
 */
export function astContainsInlineValidateSafeParse(node: AnyNode, sNames: ReadonlySet<string>): boolean {
  if (node === null || typeof node !== 'object') return false
  if (Array.isArray(node)) {
    for (const child of node as unknown as AnyNode[]) {
      if (astContainsInlineValidateSafeParse(child, sNames)) return true
    }
    return false
  }
  if (isInlineValidateSafeParseCall(node, sNames)) return true
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    const child = (node as Record<string, unknown>)[key] as AnyNode | undefined
    if (child && typeof child === 'object' && astContainsInlineValidateSafeParse(child, sNames)) {
      return true
    }
  }
  return false
}

/**
 * The STRUCTURAL half of the `withField` recognizer: is this top-level node a single-declarator
 * `const X = withField(…)`?
 *
 * Split out so the import-warning pre-pass and the recognizer decide with the SAME code. They run at different
 * times — the unlowered-module warning fires before the top-level loop — so the pre-pass cannot simply ask
 * whether the recognizer succeeded (the two-deciders-must-agree class).
 */
export function withFieldDeclShape(node: AnyNode): { bindingName: string; metaArg: AnyNode | undefined } | null {
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  if (init.callee?.type !== 'Identifier') return null
  if ((init.callee.name as string) !== 'withField') return null
  const args = (init.arguments as AnyNode[] | undefined) ?? []
  // withField(schema, meta) — second argument is the literal meta.
  return { bindingName: declarator.id.name as string, metaArg: args[1] }
}

/**
 * The VALUE half: the string-literal entries of a `withField` meta object. Shared with the pre-pass for the same
 * reason as `withFieldDeclShape`.
 */
export function extractLiteralFieldMeta(
  metaArg: AnyNode,
  /** Pass to NAME a computed key; omit for a silent probe (the pre-pass). */
  report?: { ctx: ModuleParseContext; where: string },
): FieldMetaDefnIR['meta'] {
  const meta: FieldMetaDefnIR['meta'] = []
  for (const prop of (metaArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (hasDynamicKey(prop)) {
      if (report) {
        report.ctx.report(
          `${report.where}: the computed key \`${dynamicKeyText(prop, report.ctx)}\` is only known at runtime, so this entry cannot be read at compile time and does not lower to native. Write the key literally (\`{ input: … }\`, not \`{ [kind]: … }\`).`,
        )
      }
      continue
    }
    const keyName = staticPropKey(prop)
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') {
      meta.push({ name: keyName, value: valueNode.value })
    } else {
      // Non-string meta values silently dropped in v1 (the audit's
      // Strategy-A complexity is per-validator schema introspection,
      // not the meta map; richer meta types are a follow-up).
    }
  }
  return meta
}
