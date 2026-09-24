/**
 * Type and schema emission.
 *
 * Two renderings of the same IR type: a TypeScript type annotation, and a
 * `@pyreon/validate` `s.*` expression. They are generated from one walk so
 * they cannot drift — the failure mode of writing them separately is a
 * declared type that the runtime schema does not actually enforce.
 */

import { topoSortModels } from '../core/graph'
import type { IrDocument, IrField, IrLiteral, IrNumberType, IrStringType, IrType } from '../core/ir'
import { propKey, typeIdent } from '../core/naming'
import { dialectOf, type ValidatorName } from './validator'
import { q, regexLiteral, relativeSpecifier, SourceFile } from './writer'

export const SCHEMA_FILE = 'schemas.ts'

export interface SchemaExprOptions {
  /** Narrow the output to the subset the native compiler lowers. */
  native: boolean
  /**
   * Ref targets that must be rendered as `lazy(() => X)` because naming them
   * directly would read a `const` in its temporal dead zone.
   */
  defer?: ReadonlySet<string> | undefined
  /** Which library the expression is written in. Defaults to `pyreon`. */
  validator?: ValidatorName | undefined
  /**
   * Model types by name, for INLINING a `$ref` on the native path.
   *
   * Only consulted when the dialect says inlining helps — see
   * `ValidatorDialect.inlineRefsOnNative`. PMTC drops a field that NAMES
   * another schema, and every OpenAPI document of any size is full of them; an
   * inlined ref is a nested object, which the zod recogniser does lower.
   */
  models?: ReadonlyMap<string, IrType> | undefined
  /**
   * Refs currently being inlined, so a `$ref` CYCLE terminates.
   *
   * A cycle cannot be inlined at all — there is no finite nesting for it — so
   * re-entering one falls back to NAMING the target. PMTC then drops that field
   * with a warning, which is the honest outcome: the field genuinely cannot be
   * represented, and saying so beats emitting a bounded lie.
   */
  expanding?: ReadonlySet<string> | undefined
}

/**
 * Render an IR type as a TypeScript type expression.
 *
 * `widenEnums` renders a STRING enum as `string` rather than as its literal
 * union. Two callers need it, for the same underlying reason — the declared
 * type must match what the runtime schema actually produces: the native path
 * narrows enums to their base scalar, and `@pyreon/validate`'s `s.enum` infers
 * `string` too. Declaring `'a' | 'b'` against either is a type the schema does
 * not enforce. Non-string enums are emitted as a union of `literal`s, which
 * both libraries infer exactly, so they only widen on the native path.
 */
export function tsType(type: IrType, depth = 0, widenEnums = false, native = false, files = false): string {
  switch (type.kind) {
    case 'string':
      // In a REQUEST body a `binary` string is a file: what a caller hands the
      // client is a `Blob` (a `File` is one), never text.
      return files && type.format === 'binary' ? 'Blob' : 'string'
    case 'enum':
      return enumTs(type.values, widenEnums, native)
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'unknown':
      return 'unknown'
    case 'ref':
      return type.name
    case 'nullable': {
      const inner = tsType(type.inner, depth, widenEnums, native, files)
      return `${inner} | null`
    }
    case 'array': {
      const inner = tsType(type.items, depth + 1, widenEnums, native, files)
      // `A | B[]` parses as `A | (B[])`, so a union element needs parens.
      return /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`
    }
    case 'union':
      return type.options.map((o) => tsType(o, depth + 1, widenEnums, native, files)).join(' | ')
    case 'object': {
      if (type.fields.length === 0) {
        return type.additional
          ? `Record<string, ${tsType(type.additional, depth + 1, widenEnums, native, files)}>`
          : 'Record<string, unknown>'
      }
      const pad = '  '.repeat(depth + 1)
      const close = '  '.repeat(depth)
      const body = type.fields
        .map((f) => `${pad}${propKey(f.name)}${f.required ? '' : '?'}: ${fieldTs(f, depth + 1, widenEnums, native, files)}`)
        .join('\n')
      return `{\n${body}\n${close}}`
    }
  }
}

/** The TS rendering of an enum's values, matching what its schema infers. */
function enumTs(values: readonly IrLiteral[], widen: boolean, native: boolean): string {
  if (native) {
    // The native path narrows to one scalar schema (see `schemaExpr`).
    const kinds = new Set(values.map((v) => typeof v))
    return kinds.size === 1 ? (kinds.has('number') ? 'number' : kinds.has('boolean') ? 'boolean' : 'string') : 'string'
  }
  if (widen && values.length > 1 && values.every((v) => typeof v === 'string')) return 'string'
  return values.map((v) => (typeof v === 'string' ? q(v) : String(v))).join(' | ')
}

function fieldTs(field: IrField, depth: number, widenEnums: boolean, native: boolean, files = false): string {
  const base = tsType(field.type, depth, widenEnums, native, files)
  // `exactOptionalPropertyTypes` is on across this repo and in the consumer
  // presets, where `x?: number` and `x?: number | undefined` are DIFFERENT
  // types. The schema infers the second, so the emitted type must say it — or
  // the generated module fails to typecheck against its own schema.
  return field.required ? base : `${base} | undefined`
}

/**
 * Render an IR type as an `s.*` expression.
 *
 * `native` narrows the output to the subset PMTC lowers. The difference is not
 * cosmetic: on the native path an enum becomes its base scalar and the
 * constraint is LOST there, so callers must report that rather than let a
 * reader assume the two targets validate identically.
 */
export function schemaExpr(type: IrType, opts: SchemaExprOptions, depth = 0): string {
  const dialect = dialectOf(opts.validator ?? 'pyreon')
  const b = dialect.binding
  switch (type.kind) {
    case 'string':
      return stringExpr(type, b)
    case 'enum':
      return enumExpr(type.values, b, opts.native)
    case 'number':
      return numberExpr(type, b, opts.native)
    case 'boolean':
      return `${b}.boolean()`
    case 'null':
      return opts.native ? `${b}.string()` : `${b}.null()`
    case 'unknown':
      return opts.native ? `${b}.string()` : `${b}.unknown()`
    case 'nullable':
      return `${schemaExpr(type.inner, opts, depth)}.nullable()`
    case 'ref': {
      // On the native path, INLINE the target where the dialect says nested
      // objects lower: PMTC drops a field that NAMES another schema, and an
      // inlined ref is a nested object, which its zod recogniser does lower.
      // A cycle has no finite nesting, so re-entry falls through to the name
      // and the compiler drops that one field with a warning — honest, and
      // strictly better than the whole model being dropped.
      if (opts.native && dialect.inlineRefsOnNative && opts.expanding?.has(type.name) !== true) {
        const target = opts.models?.get(type.name)
        if (target) {
          const expanding = new Set(opts.expanding ?? [])
          expanding.add(type.name)
          return schemaExpr(target, { ...opts, expanding }, depth)
        }
      }
      // A back edge closes a `$ref` cycle. `const` is not hoisted, so naming
      // the target directly here is a TDZ ReferenceError at import; `lazy`
      // defers the read to first use, which is exactly what a cycle needs.
      return opts.defer?.has(type.name) === true ? `${b}.lazy(() => ${type.name})` : type.name
    }
    case 'array': {
      let expr = `${b}.array(${schemaExpr(type.items, opts, depth + 1)})`
      if (opts.native) return expr
      if (type.minItems !== undefined) expr += `.min(${type.minItems})`
      if (type.maxItems !== undefined) expr += `.max(${type.maxItems})`
      // Neither library has a built-in uniqueness check. Items are compared by
      // their JSON text, which is exact for scalars (the dominant case) and
      // for objects serialized in a consistent key order.
      if (type.uniqueItems) {
        expr += `.refine((a) => new Set(a.map((v) => JSON.stringify(v))).size === a.length, { message: 'items must be unique' })`
      }
      return expr
    }
    case 'union': {
      if (opts.native) return `${b}.string()`
      const inner = type.options.map((o) => schemaExpr(o, opts, depth + 1)).join(', ')
      // A member deferred through `lazy` has no `.shape` at construction, and
      // `discriminatedUnion` reads every member's tag field right then -- it
      // would throw at import. A plain union validates the same payloads.
      const deferred = type.options.some((o) => o.kind === 'ref' && opts.defer?.has(o.name) === true)
      return type.discriminator && !deferred
        ? `${b}.discriminatedUnion(${q(type.discriminator)}, [${inner}])`
        : `${b}.union([${inner}])`
    }
    case 'object': {
      if (type.fields.length === 0) {
        return type.additional && !opts.native
          ? `${b}.record(${b}.string(), ${schemaExpr(type.additional, opts, depth + 1)})`
          : `${b}.object({})`
      }
      const pad = '  '.repeat(depth + 1)
      const close = '  '.repeat(depth)
      const body = type.fields.map((f) => `${pad}${propKey(f.name)}: ${fieldSchema(f, opts, depth + 1)},`).join('\n')
      return `${b}.object({\n${body}\n${close}})`
    }
  }
}

function stringExpr(type: IrStringType, b: string): string {
  let expr: string
  switch (type.format) {
    // The `.email()` / `.uuid()` chain is DEPRECATED in zod 4 in favour of
    // top-level `z.email()`, and emitted anyway: the chained form works in
    // both zod 3 and zod 4 while the top-level form exists only in 4. Picking
    // the newer spelling would silently narrow the zod versions this output
    // compiles against, and the failure would land in the consumer's repo.
    case 'email':
      expr = `${b}.string().email()`
      break
    case 'uuid':
      expr = `${b}.string().uuid()`
      break
    // `uri` is NOT `.url()`: both libraries' `url()` accepts only a URL with
    // an authority, so a valid RFC 3986 URI such as `git:git.example.com/x`
    // (GitHub's `mirror_url`) was rejected. A string is the honest reading.
    //
    // `date` / `date-time` stay strings deliberately: a date schema does not
    // lower, and parsing to a Date on web and a String on native is a
    // divergence no consumer can see coming.
    default:
      expr = `${b}.string()`
  }
  // Length and pattern checks LOWER natively (PMTC emits them into the schema
  // struct's parse), so they are kept on both paths.
  if (type.minLength !== undefined) expr += `.min(${type.minLength})`
  if (type.maxLength !== undefined) expr += `.max(${type.maxLength})`
  if (type.pattern && portableRegex(type.pattern)) expr += `.regex(${regexLiteral(type.pattern)})`
  return expr
}

function numberExpr(type: IrNumberType, b: string, native: boolean): string {
  let expr = type.integer ? `${b}.number().int()` : `${b}.number()`
  // Inclusive bounds lower natively; the strict / step checks below are not
  // in PMTC's recognised chain, so the native path stops here.
  if (type.minimum !== undefined) expr += `.min(${type.minimum})`
  if (type.maximum !== undefined) expr += `.max(${type.maximum})`
  if (native) return expr
  if (type.exclusiveMinimum !== undefined) expr += `.gt(${type.exclusiveMinimum})`
  if (type.exclusiveMaximum !== undefined) expr += `.lt(${type.exclusiveMaximum})`
  if (type.multipleOf !== undefined) {
    // An INTEGER step is exact under `%`, so the library check is used. A
    // FRACTIONAL one is not: `@pyreon/validate` tests `v % n === 0`, and
    // `19.99 % 0.01` is not 0 in binary floating point -- `.multipleOf(0.01)`
    // would reject every valid price. The refine compares the nearest multiple
    // with a relative tolerance instead.
    expr += Number.isInteger(type.multipleOf)
      ? `.multipleOf(${type.multipleOf})`
      : `.refine((v) => Math.abs(Math.round(v / ${type.multipleOf}) * ${type.multipleOf} - v) <= 1e-9 * Math.max(1, Math.abs(v)), { message: 'must be a multiple of ${type.multipleOf}' })`
  }
  return expr
}

/**
 * An enum / const.
 *
 * All-string -> `enum([...])`; one value -> `literal(v)`; anything else -> a
 * union of literals. Never a `string()` with constraints chained on: that was
 * `s.enum([...]).min(3)`, a TypeError at import time.
 */
function enumExpr(values: readonly IrLiteral[], b: string, native: boolean): string {
  if (native) {
    const kinds = new Set(values.map((v) => typeof v))
    if (kinds.size === 1 && kinds.has('number')) return `${b}.number()`
    if (kinds.size === 1 && kinds.has('boolean')) return `${b}.boolean()`
    return `${b}.string()`
  }
  const lit = (v: IrLiteral): string => (v === null ? `${b}.null()` : `${b}.literal(${typeof v === 'string' ? q(v) : String(v)})`)
  if (values.length === 1) return lit(values[0] as IrLiteral)
  if (values.every((v) => typeof v === 'string')) return `${b}.enum([${values.map((v) => q(v as string)).join(', ')}])`
  return `${b}.union([${values.map(lit).join(', ')}])`
}

function fieldSchema(field: IrField, opts: SchemaExprOptions, depth: number): string {
  let expr = schemaExpr(field.type, opts, depth)
  if (!field.required) expr += '.optional()'
  return expr
}

/**
 * Every character that ENDS a regex literal.
 *
 * The emit writes `/${pattern}/`, so this is a lexical question about the
 * emitted source, not a semantic one about the regex. A literal is terminated
 * by `/` -- and by all four JavaScript line terminators. `RegularExpressionChar`
 * is built from `RegularExpressionNonTerminator`, which is "SourceCharacter but
 * not LineTerminator", so LF, CR, U+2028 and U+2029 are illegal ANYWHERE in a
 * literal, character class included. A raw control character is NOT a
 * terminator and stays legal, which is why a pattern carrying U+0001 parses
 * while one carrying a raw newline does not.
 *
 * A `pattern` holding a raw newline is legal OpenAPI. Pre-fix it emitted
 * `.regex(/a<LF>b/)` -> `Unterminated regular expression literal '/a'`, which
 * does not drop one constraint: it kills the whole generated schemas module,
 * for every model in it.
 *
 * The package already knows this class in three other contexts -- `q()`
 * escapes all four for a string literal, `safeLineComment` collapses them for a
 * `//` comment, `jsonLiteral` re-escapes the two `JSON.stringify` leaves raw.
 * The regex literal is the fifth CONTEXT -- and, as the mock emitter later
 * proved, the first of two SITES. Both now spell the literal through
 * `regexLiteral`, which escapes what this predicate refuses; the refusal below
 * stays because it is about PORTABILITY as well, not only about lexing.
 */
const REGEX_LITERAL_TERMINATOR = /[/\r\n\u2028\u2029]/

/**
 * Accept only patterns whose syntax means the same thing in JS,
 * NSRegularExpression and java.util.regex.
 *
 * PMTC applies the same test on its side; emitting one it declines produces a
 * schema that validates on web and silently does not on native. Refusing here
 * keeps both targets honest, at the cost of dropping some constraints.
 */
function portableRegex(pattern: string): boolean {
  if (/\(\?<|\\[pPk]|\(\?\(|\\Z|\\z|\\A/.test(pattern)) return false
  // Refuse, rather than lean on `regexLiteral`'s escaping: a constraint
  // silently dropped is the documented cost of this predicate, and a `pattern`
  // is SEMANTIC input -- rewriting a user's regex to make it spellable is a
  // different act from spelling a structural one the emitter built itself.
  // `regexLiteral` still runs on what survives, as defence in depth.
  if (REGEX_LITERAL_TERMINATOR.test(pattern)) return false
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

/** Emit `schemas.ts` — one schema + one type per model. */
export function emitSchemas(
  doc: IrDocument,
  opts: { native: boolean; validator?: ValidatorName | undefined },
): SourceFile {
  const f = new SourceFile(SCHEMA_FILE)
  if (doc.models.length === 0) return f
  const dialect = dialectOf(opts.validator ?? 'pyreon')
  f.import(dialect.module, dialect.binding)
  if (dialect.typeHelper) f.importType(dialect.typeHelper.module, dialect.typeHelper.name)

  // DEPENDENCY ORDER, not alphabetical. These are `const` declarations and
  // `const` is not hoisted, so a model emitted before one it references throws
  // `Cannot access 'X' before initialization` when the module is imported.
  // Alphabetical order satisfies that only by coincidence.
  const { order, backEdges } = topoSortModels(doc)
  const byName = new Map(doc.models.map((m) => [m.name, m]))
  // Imported only when a cycle actually needs the annotation — an unused
  // import is a lint error in the consumer's repo, and a confusing one since
  // nobody wrote the file.
  if (backEdges.size > 0 && dialect.schemaTypeImport) {
    f.importType(dialect.schemaTypeImport.module, dialect.schemaTypeImport.name)
  }

  for (const name of order) {
    const model = byName.get(name)
    if (!model) continue
    // Only the edges that actually close a cycle are deferred; every other ref
    // is emitted by name, which keeps the common output unchanged.
    const defer = new Set(
      [...backEdges].filter((e) => e.startsWith(`${name}|`)).map((e) => e.slice(name.length + 1)),
    )
    f.line()
    f.doc(model.doc)
    const expr = schemaExpr(model.type, { ...opts, defer })
    if (defer.size > 0) {
      // A CYCLE. `lazy(() => X)` inside `const X = …` makes inferring X's type
      // from its own initializer circular, and TypeScript answers TS7022 —
      // the generated module does not compile. So the structural type is
      // named FIRST (type aliases are hoisted, so a forward reference to the
      // cycle partner is fine) and the const is annotated with it, which is
      // the pattern both libraries document for recursive schemas.
      //
      // Only the models that actually close a cycle take this shape; every
      // other one keeps the inferred form, which reads better and stays tied
      // to the schema rather than to a second rendering of the same IR.
      f.line(`export type ${model.name} = ${tsType(model.type, 0, dialect.enumWidensToString)}`)
      f.line(`export const ${model.name}: ${dialect.schemaTypeRef(model.name)} = ${expr}`)
      continue
    }
    // The schema is a top-level `const` bound to a plain `s.object({ … })`
    // literal, which is exactly the shape PMTC's recognizer requires. Wrapping
    // it in anything — a helper call, a `satisfies`, a spread — silently drops
    // it off the native path.
    f.line(`export const ${model.name} = ${expr}`)
    // zod infers with `z.infer<typeof X>`, which needs no separate import;
    // `@pyreon/validate` exposes the same thing as a named `Infer` helper.
    f.line(
      dialect.typeHelper
        ? `export type ${model.name} = ${dialect.typeHelper.name}<typeof ${model.name}>`
        : `export type ${model.name} = ${dialect.binding}.infer<typeof ${model.name}>`,
    )
  }
  return f
}

/** Emit `types.ts` — plain TS types, for consumers that want no runtime. */
export function emitTypes(doc: IrDocument): SourceFile {
  const f = new SourceFile('types.ts')
  // Types are hoisted, so order is cosmetic here — matched to `schemas.ts` so
  // the two files read as the same document.
  const { order } = topoSortModels(doc)
  const byName = new Map(doc.models.map((m) => [m.name, m]))
  for (const model of order.map((n) => byName.get(n)).filter((m) => m !== undefined)) {
    f.line()
    f.doc(model.doc)
    const rendered = tsType(model.type)
    const keyword = rendered.startsWith('{') ? 'interface' : 'type'
    f.line(keyword === 'interface' ? `export interface ${model.name} ${rendered}` : `export type ${model.name} = ${rendered}`)
  }
  return f
}

/** Specifier another generated file uses to import the schema module. */
export function schemaSpecifier(fromPath: string): string {
  return relativeSpecifier(fromPath, SCHEMA_FILE)
}

/** Model name for a type, when it is a ref. Used to wire response schemas. */
export function refName(type: IrType | undefined): string | undefined {
  if (!type) return undefined
  if (type.kind === 'ref') return type.name
  if (type.kind === 'array' && type.items.kind === 'ref') return type.items.name
  if (type.kind === 'nullable') return refName(type.inner)
  return undefined
}

/** A readable TS name for an operation's response. */
export function responseTypeName(type: IrType | undefined): string {
  if (!type) return 'void'
  return tsType(type)
}

export { typeIdent }
