// What a file's `@pyreon/validation` schema declarations tell the plugin, and the three ways a declared schema is
// USED after it is declared:
//
//   - `const a = zodSchema(…), b = zodSchema(…)` — several schemas in ONE declaration;
//   - `a.parse(x)` on a file-scope binding, from a handler / effect / computed;
//   - `zodSchema(z.object({ … })).parse(x)` on an inline expression.
//
// Both lower to the ADAPTER's own web result — `{ ok, value } | { ok: false, issues }`, never thrown — so one `.tsx`
// reads `.ok` / `.value` / `.issues` identically on all three targets. The adapter has no `.safeParse` (that is the
// raw zod/valibot schema's method); a call to it is declined by name.

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
   * recognizers lower counts, so a `.parse` is never pointed at a struct that was never emitted.
   */
  readonly bindings: Map<string, 'object' | 'union'>
  /** Bindings whose `.parse(x)` lowered to the struct's static `parse` — `finishModule` checks each has a struct to call. */
  readonly parseBindings: Set<string>
  /** Dedup for inline schemas keyed by the source text of the adapter call: two byte-identical ones share ONE struct. */
  readonly inlineByShape: Map<string, string>
  inlineCounter: number
}

const FACTS_KEY = '@pyreon/validation:facts'

function validationFacts(source: { fileState<T>(key: string, init: () => T): T }): ValidationFacts {
  return source.fileState<ValidationFacts>(FACTS_KEY, () => ({
    imported: false,
    bindings: new Map(),
    parseBindings: new Set(),
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
 * Deep-walk for an inline `adapter(<literal object schema>).parse(…)`. The unlowered-module warning runs before
 * any body is parsed, so "does an inline call lower?" has to be answered syntactically here — the same decision
 * the method-call recognizer makes (`literalSchemaKind`), through the same function.
 */
function containsInlineParse(node: AnyNode): boolean {
  if (node === null || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(containsInlineParse)
  if (node.type === 'CallExpression') {
    const c = node.callee as AnyNode | undefined
    if (
      c?.type === 'MemberExpression' &&
      !c.computed &&
      c.property?.type === 'Identifier' &&
      c.property.name === 'parse' &&
      literalSchemaKind(c.object as AnyNode) === 'object'
    ) {
      return true
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue
    const child = (node as Record<string, unknown>)[key]
    if (child !== null && typeof child === 'object' && containsInlineParse(child)) return true
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
  // An INLINE `adapter({ … }).parse(x)` anywhere in the tree also lowers, so the blanket "no native lowering"
  // warning must not print directly above the struct it denies.
  if (facts.imported && containsInlineParse(scan.body)) {
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

const NO_SAFE_PARSE =
  'a @pyreon/validation adapter has NO `.safeParse` — the adapter is `{ _infer, validator, parse }`, so on the web this is `undefined` and the call throws a TypeError. Use `.parse(x)`, which returns `{ ok, value } | { ok: false, issues }` and never throws; it lowers on both native targets.'

/**
 * `a.parse(x)` on a file-scope adapter binding, and `zodSchema(z.object({ … })).parse(x)` inline: the ADAPTER's own
 * result — `{ ok: true, value } | { ok: false, issues }` (an issue's `path` a dot-string), never thrown — over the
 * schema's own struct (`validationResultExpr`).
 *
 * `.safeParse` is declined by name: the adapter has none (it is the raw zod/valibot schema's method, which the
 * adapter does not expose). It used to lower to a zod-shaped `{ success, data }` that no web code could read.
 *
 * What stays web-only is WARNED by name: `.parse` on a `discriminatedUnion`, any other method.
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

  // ── inline: `zodSchema(z.object({ … })).parse(x)`
  if (
    receiver?.type === 'CallExpression' &&
    receiver.callee?.type === 'Identifier' &&
    SCHEMA_ADAPTERS.has(receiver.callee.name as string)
  ) {
    const adapter = receiver.callee.name as string
    if (method === 'safeParse') return ctx.unsupported(node, `\`${adapter}(…).safeParse(…)\``, NO_SAFE_PARSE)
    if (method !== 'parse') {
      return ctx.unsupported(
        node,
        `\`${adapter}(…).${method}(…)\``,
        'only `.parse(x)` on a schema adapter lowers to native. Keep this call in a web-only helper.',
      )
    }
    const kind = literalSchemaKind(receiver)
    if (kind !== 'object') {
      return ctx.unsupported(
        node,
        `\`${adapter}(…).parse(…)\``,
        kind === 'union'
          ? 'a `discriminatedUnion` schema lowers to a native enum with no `{ ok, value }` result form yet. Validate each variant with its own object schema, or keep this call in a web-only helper.'
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
          `\`${adapter}(…).parse(…)\``,
          'the inline schema did not lower to a native struct (see the warning above), so this call has nothing to validate against.',
        )
      }
      built.inline = true
      ctx.addItem(schemaItemSpec(built))
      facts.inlineByShape.set(shapeKey, schemaName)
    }
    const argNode = (node.arguments as AnyNode[] | undefined)?.[0]
    const arg = argNode ? ctx.expr(argNode) : { kind: 'object' as const, fields: [] }
    return { type: 'result', payload: { schemaName }, args: [arg] }
  }

  // ── bound: `a.parse(x)` where `a` is a file-scope adapter binding
  if (receiver?.type !== 'Identifier') return undefined
  const binding = receiver.name as string
  const kind = facts.bindings.get(binding)
  if (kind === undefined) return undefined
  if (method === 'safeParse') return ctx.unsupported(node, `\`${binding}.safeParse(…)\` on a @pyreon/validation schema`, NO_SAFE_PARSE)
  if (method === 'parse' && kind === 'object') {
    const argNode = (node.arguments as AnyNode[] | undefined)?.[0]
    const arg = argNode ? ctx.expr(argNode) : { kind: 'object' as const, fields: [] }
    facts.parseBindings.add(binding)
    return { type: 'result', payload: { schemaName: binding }, args: [arg] }
  }
  const reason =
    method === 'parse'
      ? 'a `discriminatedUnion` schema lowers to a native enum, which has no `{ ok, value }` result form yet. Parse each variant with its own object schema binding, or keep this call in a web-only helper.'
      : 'only `.parse(x)` on an object schema binding lowers to native. Keep this call in a web-only helper.'
  return ctx.unsupported(node, `\`${binding}.${method}(…)\` on a @pyreon/validation schema`, reason)
}

/**
 * `a.parse(…)`: the schema whose struct that call goes through must exist. A recorded binding whose
 * shape the recognizer then DECLINED has no struct to call into — say so rather than emit a call to a type that
 * does not exist.
 */
export const finishValidation: ModuleFinish = ({ items, report, fileState }) => {
  const facts = validationFacts({ fileState })
  for (const binding of facts.parseBindings) {
    const has = items.some(
      (i) => i.plugin === VALIDATION_PLUGIN_NAME && i.type === SCHEMA_ITEM_TYPE && !schemaOf(i).inline && schemaOf(i).bindingName === binding,
    )
    if (!has)
      report(
        `\`${binding}.parse(…)\` references a @pyreon/validation schema whose shape did not lower to native (no struct was emitted for \`${binding}\`), so the call cannot compile on iOS/Android. Give \`${binding}\` a literal object shape of supported fields.`,
      )
  }
}
