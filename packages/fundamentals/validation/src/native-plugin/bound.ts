// What a file's `@pyreon/validation` schema declarations tell the plugin, and the three ways a declared schema is
// USED after it is declared:
//
//   - `const a = zodSchema(…), b = zodSchema(…)` — several schemas in ONE declaration;
//   - `a.safeParse(x)` on a file-scope binding, from a handler / effect / computed;
//   - `zodSchema(z.object({ … })).safeParse(x)` on an inline expression.
//
// `@pyreon/validate`'s `s` DSL has had the last two since the standalone-validation work (its plugin owns the
// recognizers); these are the adapter-side counterparts, over the SAME `safeParse` expression and the SAME
// `safeParseResult` emit, so one `.tsx` reads `.success` / `.data` identically on all three targets.

import {
  topLevelDeclarators,
  type ExtItemSpec,
  type MethodCallRecognizer,
  type ModuleFinish,
  type ModuleParseContext,
  type ModuleScan,
} from '@pyreon/native-compiler/plugin-api'
import type { ZodSchemaDefnIR } from './ir'
import { VALIDATION_PLUGIN_NAME } from './names'
import {
  SCHEMA_ADAPTERS,
  tryArktypeSchemaDefnFromTopLevel,
  tryValibotSchemaDefnFromTopLevel,
  tryZodSchemaDefnFromTopLevel,
} from './recognize'
import { SCHEMA_ITEM_TYPE, schemaItemSpec, schemaOf } from './schema'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/** Per-file memory (`fileState`): the compiler never reads it. */
interface ValidationFacts {
  /** The file imports one of the adapters from `@pyreon/validation` — the gate every method-call recognizer checks first. */
  imported: boolean
  /**
   * File-scope schema BINDINGS, recorded syntactically BEFORE any component is parsed (a component can sit above
   * the schema it validates with, and components parse in source order). Only the literal-shape form the
   * recognizers lower counts, so a `.safeParse` is never pointed at a struct that was never emitted.
   */
  readonly bindings: Map<string, 'object' | 'union'>
  /** Bindings whose `.safeParse(x)` lowered — `finishModule` marks each matching schema so `safeParseResult` is emitted. */
  readonly safeParseResultBindings: Set<string>
  /** Dedup for inline schemas keyed by the source text of the adapter call: two byte-identical ones share ONE struct. */
  readonly inlineByShape: Map<string, string>
  inlineCounter: number
}

const FACTS_KEY = '@pyreon/validation:facts'

function validationFacts(source: { fileState<T>(key: string, init: () => T): T }): ValidationFacts {
  return source.fileState<ValidationFacts>(FACTS_KEY, () => ({
    imported: false,
    bindings: new Map(),
    safeParseResultBindings: new Set(),
    inlineByShape: new Map(),
    inlineCounter: 0,
  }))
}

/**
 * `'object'` / `'union'` when `init` is `adapter(<literal schema>)` in a form the recognizers lower, else
 * `undefined`. The grammar matches the walkers': `zodSchema(z.object({…}))`, `valibotSchema(v.object({…}))`,
 * `arktypeSchema(type({…}))`, and `…(x.discriminatedUnion(…))` for the first two.
 */
function literalSchemaKind(init: AnyNode | undefined): 'object' | 'union' | undefined {
  if (init?.type !== 'CallExpression' || init.callee?.type !== 'Identifier') return undefined
  const adapter = init.callee.name as string
  if (!SCHEMA_ADAPTERS.has(adapter)) return undefined
  const inner = (init.arguments as AnyNode[] | undefined)?.[0]
  if (inner?.type !== 'CallExpression') return undefined
  const shape = (inner.arguments as AnyNode[] | undefined)?.[0]
  if (adapter === 'arktypeSchema') {
    return inner.callee?.type === 'Identifier' && inner.callee.name === 'type' && shape?.type === 'ObjectExpression'
      ? 'object'
      : undefined
  }
  const c = inner.callee as AnyNode | undefined
  if (c?.type !== 'MemberExpression' || c.computed || c.property?.type !== 'Identifier') return undefined
  if (c.property.name === 'discriminatedUnion') return 'union'
  return c.property.name === 'object' && shape?.type === 'ObjectExpression' ? 'object' : undefined
}

/**
 * Deep-walk for an inline `adapter(<literal object schema>).safeParse(…)`. The unlowered-module warning runs before
 * any body is parsed, so "does an inline call lower?" has to be answered syntactically here — the same decision
 * the method-call recognizer makes (`literalSchemaKind`), through the same function.
 */
function containsInlineSafeParse(node: AnyNode): boolean {
  if (node === null || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(containsInlineSafeParse)
  if (node.type === 'CallExpression') {
    const c = node.callee as AnyNode | undefined
    if (
      c?.type === 'MemberExpression' &&
      !c.computed &&
      c.property?.type === 'Identifier' &&
      c.property.name === 'safeParse' &&
      literalSchemaKind(c.object as AnyNode) === 'object'
    ) {
      return true
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    const child = (node as Record<string, unknown>)[key]
    if (child !== null && typeof child === 'object' && containsInlineSafeParse(child)) return true
  }
  return false
}

/** The pre-pass: record the import and every file-scope schema binding (every declarator of a multi-declarator statement). */
export function scanValidationBindings(scan: ModuleScan): void {
  const facts = validationFacts(scan)
  for (const node of scan.body as readonly AnyNode[]) {
    if (node.type === 'ImportDeclaration' && node.source?.value === '@pyreon/validation') {
      for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
        if (spec.type === 'ImportSpecifier' && SCHEMA_ADAPTERS.has(spec.imported?.name as string)) facts.imported = true
      }
    }
    for (const d of topLevelDeclarators(node)) {
      if (d.id?.type !== 'Identifier') continue
      const kind = literalSchemaKind(d.init as AnyNode)
      if (kind !== undefined) facts.bindings.set(d.id.name as string, kind)
    }
  }
  // An INLINE `adapter({ … }).safeParse(x)` anywhere in the tree also lowers, so the blanket "no native lowering"
  // warning must not print directly above the struct it denies.
  if (facts.imported && containsInlineSafeParse(scan.body)) {
    for (const adapter of SCHEMA_ADAPTERS) scan.lowered('@pyreon/validation', adapter)
  }
}

/** A single-declarator copy of `declarator`, so the one-declarator recognizers can run on each declarator of a multi-declarator statement. */
const singleDeclaration = (declarator: AnyNode): AnyNode => ({
  type: 'VariableDeclaration',
  kind: 'const',
  declarations: [declarator],
})

function recognizeSchema(node: AnyNode, ctx: ModuleParseContext): ZodSchemaDefnIR | null {
  return (
    tryZodSchemaDefnFromTopLevel(node, ctx) ??
    tryValibotSchemaDefnFromTopLevel(node, ctx) ??
    tryArktypeSchemaDefnFromTopLevel(node, ctx)
  )
}

/**
 * `const a = zodSchema(…), b = zodSchema(…)` — ONE declaration, several schemas. The recognizers read exactly one
 * declarator, so the statement fell through to a VERBATIM emit (`private let a = zodSchema(z.object(…))`), which
 * neither target can compile. Every declarator lowers to its own struct; the first rides the statement's own item
 * and the rest are added alongside it.
 *
 * All-or-nothing: a statement mixing a schema with a declarator that does not lower (`const a = zodSchema(…), n = 3`)
 * cannot be claimed without dropping the other declarator, so it is WARNED by name instead of half-lowered.
 */
export function lowerMultiDeclarator(node: AnyNode, ctx: ModuleParseContext): ExtItemSpec | undefined {
  const declarators = topLevelDeclarators(node)
  if (declarators.length < 2) return undefined
  const adapterCalls = declarators.filter(
    (d) => d.init?.type === 'CallExpression' && SCHEMA_ADAPTERS.has(d.init.callee?.name as string),
  )
  if (adapterCalls.length === 0) return undefined
  const specs: ExtItemSpec[] = []
  for (const d of declarators) {
    const hit = recognizeSchema(singleDeclaration(d), ctx)
    if (hit === null) break
    specs.push(schemaItemSpec(hit))
  }
  if (specs.length === declarators.length) {
    for (const extra of specs.slice(1)) ctx.addItem(extra)
    return specs[0]
  }
  const names = declarators.map((d) => (d.id?.type === 'Identifier' ? `\`${d.id.name as string}\`` : '…')).join(', ')
  ctx.report(
    `a multi-declarator statement (${names}) holds a schema adapter call that did not lower to a native struct ` +
      `(see the warning above for the declarator), so the WHOLE statement is reproduced VERBATIM and the native build ` +
      `fails on a symbol that exists only in JS. Split it into one \`const\` per schema, each with an inline literal schema.`,
  )
  return undefined
}

const PARSE_THROWS =
  '`.parse()` THROWS on invalid input, which needs a native error model (try/throw lowering) PMTC does not carry yet. Use `.safeParse(x)` and branch on `.success` — it lowers on both targets.'

/**
 * `a.safeParse(x)` on a file-scope binding, and `zodSchema(z.object({ … })).safeParse(x)` inline: a `safeParse`
 * expression over the schema's own struct, whose `safeParseResult` carries the web's `{ success, data }` shape.
 * Without it the verbatim call was a STATIC method called through an instance, with an object-literal argument
 * lowered to a synthesized struct where the method takes a dictionary — compiling on neither target, with zero
 * warnings.
 *
 * What stays web-only is WARNED by name: `.parse()` (throws), `.safeParse` on a `discriminatedUnion`, any other method.
 * Returns undefined for a receiver that is neither, so an unrelated `x.parse(…)` falls through.
 */
export const recognizeValidationMethodCall: MethodCallRecognizer = (site, ctx) => {
  const facts = validationFacts(ctx)
  if (!facts.imported && facts.bindings.size === 0) return undefined
  const node = site.node as AnyNode
  const callee = node.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression' || callee.computed || callee.property?.type !== 'Identifier') return undefined
  const method = callee.property.name as string
  const receiver = callee.object as AnyNode

  // ── inline: `zodSchema(z.object({ … })).safeParse(x)`
  if (
    receiver?.type === 'CallExpression' &&
    receiver.callee?.type === 'Identifier' &&
    SCHEMA_ADAPTERS.has(receiver.callee.name as string)
  ) {
    const adapter = receiver.callee.name as string
    if (method === 'parse') return ctx.unsupported(node, `\`${adapter}(…).parse(…)\``, PARSE_THROWS)
    if (method !== 'safeParse') {
      return ctx.unsupported(
        node,
        `\`${adapter}(…).${method}(…)\``,
        'only `.safeParse(x)` on a schema lowers to native. Keep this call in a web-only helper.',
      )
    }
    const kind = literalSchemaKind(receiver)
    if (kind !== 'object') {
      return ctx.unsupported(
        node,
        `\`${adapter}(…).safeParse(…)\``,
        kind === 'union'
          ? 'a `discriminatedUnion` schema lowers to a native enum with no `{ success, data }` result form yet. Validate each variant with its own object schema, or keep this call in a web-only helper.'
          : 'the schema argument is not an inline literal object shape, so no struct can be synthesized. Inline it (`' +
              adapter +
              '(z.object({ … }))`) or declare it at the top level.',
      )
    }
    const start = receiver.start as number | undefined
    const end = receiver.end as number | undefined
    const shapeKey = typeof start === 'number' && typeof end === 'number' ? ctx.source.slice(start, end) : `__inline_${facts.inlineCounter}`
    let schemaName = facts.inlineByShape.get(shapeKey)
    if (schemaName === undefined) {
      schemaName = `VInline${facts.inlineCounter++}`
      const synth = singleDeclaration({
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name: schemaName },
        init: receiver,
      })
      const built = recognizeSchema(synth, ctx)
      if (built === null) {
        return ctx.unsupported(
          node,
          `\`${adapter}(…).safeParse(…)\``,
          'the inline schema did not lower to a native struct (see the warning above), so this call has nothing to validate against.',
        )
      }
      built.inline = true
      built.emitSafeParseResult = true
      ctx.addItem(schemaItemSpec(built))
      facts.inlineByShape.set(shapeKey, schemaName)
    }
    const argNode = (node.arguments as AnyNode[] | undefined)?.[0]
    const arg = argNode ? ctx.expr(argNode) : { kind: 'object' as const, fields: [] }
    return { type: 'safeParse', payload: { schemaName }, args: [arg] }
  }

  // ── bound: `a.safeParse(x)` where `a` is a file-scope schema binding
  if (receiver?.type !== 'Identifier') return undefined
  const binding = receiver.name as string
  const kind = facts.bindings.get(binding)
  if (kind === undefined) return undefined
  if (method === 'safeParse' && kind === 'object') {
    const argNode = (node.arguments as AnyNode[] | undefined)?.[0]
    const arg = argNode ? ctx.expr(argNode) : { kind: 'object' as const, fields: [] }
    facts.safeParseResultBindings.add(binding)
    return { type: 'safeParse', payload: { schemaName: binding }, args: [arg] }
  }
  const reason =
    method === 'parse'
      ? PARSE_THROWS
      : method === 'safeParse'
        ? 'a `discriminatedUnion` schema lowers to a native enum with no `{ success, data }` result form yet. Validate each variant with its own object schema binding, or keep this call in a web-only helper.'
        : 'only `.safeParse(x)` on an object schema binding lowers to native. Keep this call in a web-only helper.'
  return ctx.unsupported(node, `\`${binding}.${method}(…)\` on a @pyreon/validation schema`, reason)
}

/**
 * `a.safeParse(…)`: give that schema the `safeParseResult` its expression lowers to. A recorded binding whose
 * shape the recognizer then DECLINED has no struct to call into — say so rather than emit a call to a type that
 * does not exist.
 */
export const finishValidation: ModuleFinish = ({ items, report, fileState }) => {
  for (const binding of validationFacts({ fileState }).safeParseResultBindings) {
    const item = items.find(
      (i) =>
        i.plugin === VALIDATION_PLUGIN_NAME &&
        i.type === SCHEMA_ITEM_TYPE &&
        !schemaOf(i).inline &&
        schemaOf(i).bindingName === binding,
    )
    if (item) schemaOf(item).emitSafeParseResult = true
    else {
      report(
        `\`${binding}.safeParse(…)\` references a @pyreon/validation schema whose shape did not lower to native (no struct was emitted for \`${binding}\`), so the call cannot compile on iOS/Android. Give \`${binding}\` a literal object shape of supported fields.`,
      )
    }
  }
}
