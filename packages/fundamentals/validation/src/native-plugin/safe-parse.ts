// The `safeParse` expression every schema-lowering plugin shares: `<schema>.safeParse(x)` →
// `PyreonZodSchema_<name>.safeParseResult(<x-as-dictionary>)`. It lives with the schema model (not in
// `@pyreon/validate`'s plugin) because `@pyreon/validation`'s adapters lower the same `{ success, data }` result,
// and a plugin depends on the model's package, never the reverse.

import {
  kotlinStr,
  swiftStr,
  type EmitContext,
  type ExprEmitter,
  type ExprIR,
  type ExtExprIR,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'

/**
 * Does a value of type `t` need converting before a schema can read it?
 *
 * An emitted schema's `parse` reads plain values — a dictionary for an object, native scalars for fields. A
 * scalar already is one; a struct, an inline object, or a collection that holds either is a typed value, and is
 * routed through the runtime's `pyreonSchemaValue` (Codable / @Serializable → plain JSON values). An `unknown`
 * type is NOT converted: the conversion only compiles for an encodable value, and guessing would turn code that
 * compiles into code that does not.
 */
export function schemaInputNeedsConversion(t: TypeIR): boolean {
  switch (t.kind) {
    case 'typeRef':
    case 'object':
      return true
    case 'array':
    case 'set':
      return schemaInputNeedsConversion(t.element)
    case 'map':
      return schemaInputNeedsConversion(t.value)
    case 'union':
      return t.branches.some(schemaInputNeedsConversion)
    default:
      return false
  }
}

const isLiteralObject = (e: ExprIR): e is Extract<ExprIR, { kind: 'object' }> =>
  e.kind === 'object' && (!e.spreads || e.spreads.length === 0)

/**
 * Standalone validation: emit an expression as a DYNAMIC Swift value for a `safeParse` argument — an object
 * literal becomes a `[String: Any]` dictionary (NOT a synthesized struct), an array becomes a native array with
 * dynamic elements, and any other expression is emitted verbatim (it must already be `[String: Any]`-typed).
 * Recurses so nested objects/arrays lower to nested dictionaries. This is what keeps
 * `s.object(…).safeParse({ n: 1 })` validating a runtime map the way the web `safeParse(unknown)` does.
 */
function swiftDynamicValue(e: ExprIR, ctx: EmitContext): string {
  if (isLiteralObject(e)) {
    if (e.fields.length === 0) return `[String: Any]()`
    const entries = e.fields.map((f) => `${swiftStr(f.name)}: ${swiftDynamicValue(f.value, ctx)}`).join(', ')
    return `[${entries}] as [String: Any]`
  }
  if (e.kind === 'array') {
    if (e.elements.length === 0) return `[Any]()`
    const elems = e.elements.map((el) => swiftDynamicValue(el, ctx)).join(', ')
    return `[${elems}]`
  }
  // A typed value (struct, inline object, or a collection of them) nested in a literal: the schema reads plain
  // values, so it goes through its own Codable encoding. A scalar is already one.
  if (schemaInputNeedsConversion(ctx.inferType(e))) return `pyreonSchemaValue(${ctx.expr(e)})`
  return ctx.expr(e)
}

/**
 * The argument of a lowered `safeParse`. An object LITERAL is already the dictionary the schema reads. Anything
 * else — a variable, a signal read, a call — holds a typed value (`Pet.safeParse(pet())`), which used to be
 * passed as-is and did not compile; `pyreonSchemaInput` converts it through the value's own Codable encoding
 * (and passes an existing dictionary through untouched).
 */
function swiftSchemaInput(e: ExprIR, ctx: EmitContext): string {
  if (isLiteralObject(e)) return swiftDynamicValue(e, ctx)
  return `pyreonSchemaInput(${ctx.expr(e)})`
}

/** The Kotlin twin of {@link swiftDynamicValue}: an object literal becomes a `Map<String, Any?>`, an array a `listOf`. */
function kotlinDynamicValue(e: ExprIR, ctx: EmitContext): string {
  if (isLiteralObject(e)) {
    if (e.fields.length === 0) return `mapOf<String, Any?>()`
    const entries = e.fields.map((f) => `${kotlinStr(f.name)} to ${kotlinDynamicValue(f.value, ctx)}`).join(', ')
    return `mapOf<String, Any?>(${entries})`
  }
  if (e.kind === 'array') {
    if (e.elements.length === 0) return `listOf<Any?>()`
    const elems = e.elements.map((el) => kotlinDynamicValue(el, ctx)).join(', ')
    return `listOf<Any?>(${elems})`
  }
  // A typed value (data class, inline object, or a collection of them) nested in a literal: the schema reads
  // plain values, so it goes through its own serializer. A scalar is already one.
  if (schemaInputNeedsConversion(ctx.inferType(e))) return `pyreonSchemaValue(${ctx.expr(e)})`
  return ctx.expr(e)
}

function kotlinSchemaInput(e: ExprIR, ctx: EmitContext): string {
  if (isLiteralObject(e)) return kotlinDynamicValue(e, ctx)
  return `pyreonSchemaInput(${ctx.expr(e)})`
}

const schemaNameOf = (e: ExtExprIR): string => String(e.payload.schemaName)

/**
 * `<schema>.safeParse(x)` → `PyreonZodSchema_<name>.safeParseResult(<x-as-dictionary>)`, which returns
 * `PyreonParseResult<Self>` — a wrapping `.success` / `.data` member access composes over it. The argument is
 * emitted as a dynamic `[String: Any]` / `Map<String, Any?>` (never a synthesized struct).
 */
export const safeParseExpr: ExprEmitter = {
  swift: (e, ctx) => `PyreonZodSchema_${schemaNameOf(e)}.safeParseResult(${swiftSchemaInput(e.args[0]!, ctx)})`,
  kotlin: (e, ctx) => `PyreonZodSchema_${schemaNameOf(e)}.safeParseResult(${kotlinSchemaInput(e.args[0]!, ctx)})`,
  typing: {
    // `safeParse(x)` yields a `PyreonParseResult<T>`, not a TypeIR the inferer models — but its fields are typed
    // below, and the value is rarely stored bare, so `unknown` here is sufficient and never a broken emit (a
    // `const r = …safeParse(x)` becomes `let r: Any`, which compiles).
    type: () => ({ kind: 'unknown' }),
    // `.success` is a Bool; `.data` is the optional validated value → left unknown. Reading this off the node
    // keeps a wrapping `computed`'s type precise (`Bool`, not `Any`).
    member: (_e, property) => (property === 'success' ? { kind: 'boolean' } : { kind: 'unknown' }),
  },
  // The node this replaced hashed as `{ kind: 'schema-validate', schemaName, arg }`, so the names `moduleTag`
  // derives for synthesized structs do not move.
  legacyHash: (e) => ({ kind: 'schema-validate', schemaName: schemaNameOf(e), arg: e.args[0] }),
  rename(e, renames) {
    const to = renames.get(schemaNameOf(e))
    if (to !== undefined) (e.payload as { schemaName: string }).schemaName = to
  },
}

/**
 * The library's OWN web result shape, lowered: `@pyreon/validate`'s `s.object(…).parse(x)` / `.safeParse(x)` (one
 * method under two names) and a `@pyreon/validation` adapter's `parse(x)` both return
 * `{ ok: true, value } | { ok: false, issues }` and NEVER throw. Natively that is the runtime's
 * `pyreonValidateResult { … }` / `pyreonValidationResult { … }` around the struct's own throwing `parse`, so the
 * shared source reads `r.ok` / `r.value` / `r.issues` identically on all three targets. The two differ only in the
 * issue: validate's `path` is an array of keys, the adapter's a dot-string — the same difference as on the web.
 *
 * (This replaced a zod-shaped `{ success, data }` result for `.safeParse` and a THROWING `.parse` — neither
 * library has either shape.)
 */
function resultExpr(library: 'validate' | 'validation'): ExprEmitter {
  const fn = library === 'validate' ? 'pyreonValidateResult' : 'pyreonValidationResult'
  const resultType = library === 'validate' ? 'PyreonValidateResult' : 'PyreonValidationResult'
  const struct = (e: ExtExprIR): string => `PyreonZodSchema_${schemaNameOf(e)}`
  const issueType = library === 'validate' ? 'PyreonValidateIssue' : 'PyreonValidationIssue'
  const issue = (property: string): TypeIR | undefined =>
    property === 'message'
      ? { kind: 'string' }
      : property === 'path'
        ? library === 'validate'
          ? { kind: 'array', element: { kind: 'string' } }
          : { kind: 'string' }
        : undefined
  const member = (args: readonly TypeIR[], property: string): TypeIR | undefined =>
    property === 'ok'
      ? { kind: 'boolean' }
      : property === 'value'
        ? args[0]
        : property === 'issues'
          ? { kind: 'array', element: { kind: 'typeRef', name: issueType, args: [] } }
          : undefined
  return {
    swift: (e, ctx) => `${fn} { try ${struct(e)}.parse(${swiftSchemaInput(e.args[0]!, ctx)}) }`,
    kotlin: (e, ctx) => `${fn} { ${struct(e)}.parse(${kotlinSchemaInput(e.args[0]!, ctx)}) }`,
    typing: {
      type: (e) => ({ kind: 'typeRef', name: resultType, args: [{ kind: 'typeRef', name: struct(e), args: [] }] }),
      member: (e, property) => member([{ kind: 'typeRef', name: struct(e), args: [] }], property) ?? { kind: 'unknown' },
      // `const r = X.parse(v); r.value.name` — the local keeps only the `typeRef`, so its reads are typed from it.
      resultTypes: [
        { name: resultType, member },
        { name: issueType, member: (_args, property) => issue(property) },
      ],
    },
    rename(e, renames) {
      const to = renames.get(schemaNameOf(e))
      if (to !== undefined) (e.payload as { schemaName: string }).schemaName = to
    },
  }
}

/** `@pyreon/validate`: `s.object(…).parse(x)` and `.safeParse(x)` — the same method, the same result. */
export const validateResultExpr: ExprEmitter = resultExpr('validate')

/** A `@pyreon/validation` adapter's `parse(x)` (the adapter has no `safeParse`). */
export const validationResultExpr: ExprEmitter = resultExpr('validation')
