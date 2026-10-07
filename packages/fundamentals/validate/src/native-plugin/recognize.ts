import {
  type ExtItemSpec,
  type MethodCallRecognizer,
  type ModuleFinish,
  type ModuleParseContext,
  type TopLevelRecognizer,
} from '@pyreon/native-compiler/plugin-api'
import {
  SCHEMA_ITEM_TYPE,
  schemaItemSpec,
  schemaOf,
  tryNamespacedSchemaDefnFromTopLevel,
  type ZodSchemaDefnIR,
} from '@pyreon/validation/native-plugin'
import { extractLiteralFieldMeta, isInlineValidateSafeParseCall, withFieldDeclShape } from './ast'
import { validateFacts } from './facts'
import { VALIDATE_PLUGIN_NAME } from './names'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const FIELD_META_ITEM_TYPE = 'fieldMeta'

/**
 * `const X = withField(schema, { label, hint, … })`. PMTC discards the schema argument (a Zod / Valibot / ArkType
 * runtime object does not translate) and emits a metadata struct holding the literal `meta` fields, so
 * downstream native code can reference `X.label`, `X.placeholder` — useful for form labels / UI hints even
 * without runtime schema validation.
 *
 * Deferred: schema introspection, the parseReactive / formatErrors / watchValid / getMeta runtime, non-string
 * meta values (booleans, i18n key objects).
 */
function recognizeFieldMeta(node: AnyNode, ctx: ModuleParseContext): ExtItemSpec | undefined {
  const shape = withFieldDeclShape(node)
  if (!shape) return undefined
  const { bindingName, metaArg } = shape

  if (!metaArg || metaArg.type !== 'ObjectExpression') {
    ctx.report(
      `withField declaration \`${bindingName}\`: second argument must be a literal meta object — v1 emit needs the literal shape. Falling back to silent-drop.`,
    )
    return undefined
  }

  const meta = extractLiteralFieldMeta(metaArg, {
    ctx,
    where: `withField declaration \`${bindingName}\`: meta`,
  })

  if (meta.length === 0) {
    ctx.report(
      `withField declaration \`${bindingName}\`: no recognized meta fields (only string-valued literals supported in v1). Falling back to silent-drop.`,
    )
    return undefined
  }

  return { type: FIELD_META_ITEM_TYPE, name: bindingName, payload: { bindingName, meta } }
}

/**
 * `@pyreon/validate`'s `s`-DSL schema recognizer. Matches the wrapper-less shape:
 *
 *   import { s } from '@pyreon/validate'
 *   const userSchema = s.object({ name: s.string().min(2), age: s.number() })
 *
 * Reuses the zod/valibot/arktype walker wholesale — the field shapes, constraint chains, `.optional()`, nested
 * objects, arrays and discriminated unions are all the same grammar with a different namespace prefix. The only
 * structural difference is the absent wrapper call, which is why the walker takes a nullable `schemaFn`.
 *
 * Refuses to fire unless `s` was actually imported from `@pyreon/validate` (see `scanValidate`): `s.object(...)`
 * is not a distinctive enough shape to claim on the bare name.
 */
export const recognizeTopLevel: TopLevelRecognizer = (node, ctx) => {
  const withField = recognizeFieldMeta(node, ctx)
  if (withField) return withField
  for (const local of validateFacts(ctx).names) {
    const hit = tryNamespacedSchemaDefnFromTopLevel(node, ctx, null, local, 'pyreon-validate')
    if (hit) return schemaItemSpec(hit)
  }
  return undefined
}

/**
 * Standalone validation: lower an inline `s.object({ … }).safeParse(ARG)` to a `safeParse` expression.
 * Synthesizes (+ dedups) the schema struct as an INLINE item, so the emit renders it with the web-faithful
 * `safeParseResult`; a wrapping `.success` / `.data` member access composes over the returned node. Reuses the
 * field walker, so scalar objects, nested objects, arrays and constraint chains all lower exactly as the
 * top-level `const X = s.object(…)` form does.
 */
function recognizeInline(
  site: Parameters<MethodCallRecognizer>[0],
  ctx: ModuleParseContext,
): ReturnType<MethodCallRecognizer> {
  const facts = validateFacts(ctx)
  const node = site.node as AnyNode
  if (!isInlineValidateSafeParseCall(node, facts.names)) return undefined
  const callee = node.callee as AnyNode
  const schemaCall = callee.object as AnyNode
  const schemaCallee = schemaCall.callee as AnyNode
  const sName = schemaCallee.object.name as string

  // Dedup by the exact source text of the `s.object({ … })` node — two byte-identical inline schemas share one
  // synthesized struct.
  const start = schemaCall.start as number | undefined
  const shapeEnd = schemaCall.end as number | undefined
  const shapeKey =
    typeof start === 'number' && typeof shapeEnd === 'number'
      ? ctx.source.slice(start, shapeEnd)
      : `__inline_${facts.inlineCounter}`

  let schemaName = facts.inlineByShape.get(shapeKey)
  if (schemaName === undefined) {
    schemaName = `Inline${facts.inlineCounter++}`
    // Reuse the top-level walker on a SYNTHETIC `const <name> = s.object({ … })` declaration (schemaFn=null, the
    // wrapper-less shape) — the exact same code path the named `const X = s.object(…)` form takes.
    const synthDecl: AnyNode = {
      type: 'VariableDeclaration',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: { type: 'Identifier', name: schemaName },
          init: schemaCall,
        },
      ],
    }
    const schema = tryNamespacedSchemaDefnFromTopLevel(synthDecl, ctx, null, sName, sName)
    // The walker returns null only when the object shape has NO recognized fields — an empty `s.object({})`
    // validates anything, so a zero-field struct is the faithful lowering (never a broken emit).
    const built: ZodSchemaDefnIR = schema ?? { bindingName: schemaName, fields: [] }
    built.inline = true
    built.emitSafeParseResult = true
    ctx.addItem(schemaItemSpec(built))
    facts.inlineByShape.set(shapeKey, schemaName)
  }

  const argNode = (node.arguments as AnyNode[] | undefined)?.[0]
  const arg = argNode ? ctx.expr(argNode) : { kind: 'object' as const, fields: [] }
  return { type: 'safeParse', payload: { schemaName }, args: [arg] }
}

/**
 * `Pet.safeParse(x)` on a FILE-SCOPE binding (`const Pet = s.object({ … })`).
 *
 * The binding lowers to a struct (`PyreonZodSchema_Pet`) plus a module-scope INSTANCE (`let Pet =
 * PyreonZodSchema_Pet()`), and its parse methods are STATIC. So the verbatim `Pet.safeParse(x)` was a static call
 * through an instance — plus an object-literal argument lowered to a synthesized struct where the method takes a
 * dictionary — and compiled on neither target, with zero warnings. It now lowers exactly as the inline form does:
 * a `safeParse` expression over the binding's own struct, whose `safeParseResult` carries the web's
 * `{ success, data }` shape.
 *
 * What stays web-only is WARNED by name rather than emitted broken:
 *   - `.parse(x)` THROWS on invalid input, which needs the native error model (`try`/`throw` lowering) PMTC does
 *     not carry yet;
 *   - `.safeParse` on a `discriminatedUnion` binding — its native enum has no `{ success, data }` result form yet;
 *   - the async variants and any other method.
 *
 * Returns undefined when the receiver is not a recorded binding, so an unrelated `x.parse(…)` falls through.
 */
function recognizeBound(
  site: Parameters<MethodCallRecognizer>[0],
  ctx: ModuleParseContext,
): ReturnType<MethodCallRecognizer> {
  const facts = validateFacts(ctx)
  if (facts.bindings.size === 0) return undefined
  const node = site.node as AnyNode
  const callee = node.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression' || callee.computed) return undefined
  if (callee.object?.type !== 'Identifier') return undefined
  const binding = callee.object.name as string
  const kind = facts.bindings.get(binding)
  if (kind === undefined) return undefined
  if (callee.property?.type !== 'Identifier') return undefined
  const method = callee.property.name as string
  if (method === 'safeParse' && kind === 'object') {
    const argNode = (node.arguments as AnyNode[] | undefined)?.[0]
    const arg = argNode ? ctx.expr(argNode) : { kind: 'object' as const, fields: [] }
    facts.safeParseResultBindings.add(binding)
    return { type: 'safeParse', payload: { schemaName: binding }, args: [arg] }
  }
  const reason =
    method === 'parse'
      ? '`.parse()` THROWS on invalid input, which needs a native error model (try/throw lowering) PMTC does not carry yet. Use `.safeParse(x)` and branch on `.success` — it lowers on both targets.'
      : method === 'safeParse'
        ? 'a `discriminatedUnion` schema lowers to a native enum with no `{ success, data }` result form yet. Validate each variant with its own `s.object(…)` binding, or keep this call in a web-only helper.'
        : 'only `.safeParse(x)` on an `s.object({ … })` binding lowers to native. Keep this call in a web-only helper.'
  return ctx.unsupported(node, `\`${binding}.${method}(…)\` on a @pyreon/validate schema`, reason)
}

/** Registered under `'*'`: the bound form claims ANY method on a recorded binding (to warn by name), the inline form only `safeParse`. */
export const recognizeMethodCall: MethodCallRecognizer = (site, ctx) => {
  if (validateFacts(ctx).names.size === 0) return undefined
  return recognizeInline(site, ctx) ?? recognizeBound(site, ctx)
}

/**
 * `Pet.safeParse(x)` on a file-scope binding: give that schema the `safeParseResult` its expression lowers to. A
 * recorded binding whose shape the recognizer then DECLINED has no struct to call into — say so rather than
 * emitting a call to a type that does not exist.
 */
export const finishValidate: ModuleFinish = ({ items, report, fileState }) => {
  for (const binding of validateFacts({ fileState }).safeParseResultBindings) {
    const item = items.find(
      (i) =>
        i.plugin === VALIDATE_PLUGIN_NAME &&
        i.type === SCHEMA_ITEM_TYPE &&
        !schemaOf(i).inline &&
        schemaOf(i).bindingName === binding,
    )
    if (item) schemaOf(item).emitSafeParseResult = true
    else {
      report(
        `\`${binding}.safeParse(…)\` references a @pyreon/validate schema whose shape did not lower to native (no struct was emitted for \`${binding}\`), so the call cannot compile on iOS/Android. Give \`${binding}\` a literal \`s.object({ … })\` shape of supported fields.`,
      )
    }
  }
}
