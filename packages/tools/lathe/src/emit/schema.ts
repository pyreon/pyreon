/**
 * Type and schema emission.
 *
 * Two renderings of the same IR type: a TypeScript type annotation, and a
 * `@pyreon/validate` `s.*` expression. They are generated from one walk so
 * they cannot drift — the failure mode of writing them separately is a
 * declared type that the runtime schema does not actually enforce.
 */

import { deferredTargets, modelDependencies, modelIndex, stronglyConnected, topoSortModels } from '../core/graph'
import type { IrDocument, IrField, IrLiteral, IrNumberType, IrStringType, IrType } from '../core/ir'
import { propKey, typeIdent } from '../core/naming'
import { collectRefNames } from '../core/walk'
import { dialectOf, type ValidatorName } from './validator'
import { fieldDoc, modelDoc } from './jsdoc'
import { q, regexLiteral, relativeSpecifier, safeBlockComment, SourceFile } from './writer'

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
   * The BINDING a named model's schema has, when it is not the model's name.
   *
   * The native modules name each schema const differently from its type
   * (audit G6): TypeScript keeps values and types in separate namespaces, but
   * Swift and Kotlin do not, so `const Pet` beside `type Pet` became
   * `let Pet` beside `struct Pet` — `invalid redeclaration` on both targets.
   */
  refBinding?: ((name: string) => string) | undefined
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
 *
 * `emptyObject` is how an object with no fields and no `additionalProperties`
 * is spelled: what the schema library infers for `object({})`. zod strips
 * unknown keys and infers `Record<string, never>`; `@pyreon/validate` infers
 * a type `Record<string, unknown>` agrees with.
 *
 * `unknownType` is how a value of unknown shape is spelled -- `unknown`
 * everywhere except a form / multipart body, where it is what the encoder
 * accepts (`FormValue`): `unknown` is not assignable to it.
 */
export function tsType(
  type: IrType,
  depth = 0,
  widenEnums = false,
  native = false,
  files = false,
  emptyObject = 'Record<string, unknown>',
  unknownType = 'unknown',
): string {
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
      return unknownType
    case 'ref':
      return type.name
    case 'nullable': {
      const inner = tsType(type.inner, depth, widenEnums, native, files, emptyObject, unknownType)
      return `${inner} | null`
    }
    case 'array': {
      const inner = tsType(type.items, depth + 1, widenEnums, native, files, emptyObject, unknownType)
      // `A | B[]` parses as `A | (B[])`, so a union element needs parens.
      return /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`
    }
    case 'union':
      return type.options.map((o) => tsType(o, depth + 1, widenEnums, native, files, emptyObject, unknownType)).join(' | ')
    case 'object': {
      if (type.fields.length === 0) {
        return type.additional
          ? `Record<string, ${tsType(type.additional, depth + 1, widenEnums, native, files, emptyObject, unknownType)}>`
          : emptyObject
      }
      const pad = '  '.repeat(depth + 1)
      const close = '  '.repeat(depth)
      const body = type.fields
        .map((f) => `${pad}${propKey(f.name)}${f.required ? '' : '?'}: ${fieldTs(f, depth + 1, widenEnums, native, files, emptyObject, unknownType)}`)
        .join('\n')
      if (type.additional && !native) {
        // An index signature must admit every declared property's type too.
        const values = new Set([
          tsType(type.additional, depth + 1, widenEnums, native, files, emptyObject, unknownType),
          ...type.fields.map((f) => fieldTs(f, depth + 1, widenEnums, native, files, emptyObject, unknownType)),
        ])
        return `{\n${body}\n${close}} & Record<string, ${[...values].join(' | ')}>`
      }
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

function fieldTs(
  field: IrField,
  depth: number,
  widenEnums: boolean,
  native: boolean,
  files = false,
  emptyObject = 'Record<string, unknown>',
  unknownType = 'unknown',
): string {
  const base = tsType(field.type, depth, widenEnums, native, files, emptyObject, unknownType)
  // `exactOptionalPropertyTypes` is on across this repo and in the consumer
  // presets, where `x?: number` and `x?: number | undefined` are DIFFERENT
  // types. The schema infers the second, so the emitted type must say it — or
  // the generated module fails to typecheck against its own schema.
  return field.required ? base : `${base} | undefined`
}

/**
 * The pure-call annotation on every emitted builder call.
 *
 * `s.object({ … })` and `api.endpoint(…)` are module-level CALLS, and a
 * bundler keeps a call it cannot prove side-effect-free, so every schema and
 * every endpoint in a module a hook reaches was retained. The annotation has
 * to be on EVERY call, arguments included: on the outer declaration alone the
 * bundler still had to evaluate the argument calls (`s.string().uuid()`), which
 * is why an earlier measurement of the outer-only form found it worth 2% and
 * concluded the annotation was useless.
 */
export const PURE = '/* @__PURE__ */ '

/**
 * Annotate an expression pure unless it already starts with a pure call. A
 * chain on a bare model NAME (`Author.optional()`) is a method call the bundler
 * cannot prove pure, and it sits inside the enclosing `s.object({ … })`
 * arguments -- without its own annotation it pinned the whole enclosing model
 * into every bundle that reached its module.
 */
function purify(expr: string, native: boolean): string {
  return native || expr.startsWith(PURE) ? expr : `${PURE}${expr}`
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
  // Every builder CALL is annotated pure (web only -- the native recognizers
  // read these files, and they are not bundled). See `PURE` for why.
  const p = opts.native ? '' : PURE
  const c = (ctor: string): string => `${p}${b}.${ctor}`
  switch (type.kind) {
    case 'string':
      return stringExpr(type, b, p, dialect.uriCheck)
    case 'enum':
      return enumExpr(type.values, b, opts.native, p)
    case 'number':
      return numberExpr(type, b, opts.native, p)
    case 'boolean':
      return `${c('boolean')}()`
    case 'null':
      return opts.native ? `${c('string')}()` : `${c('null')}()`
    case 'unknown':
      return opts.native ? `${c('string')}()` : `${c('unknown')}()`
    case 'nullable':
      return purify(`${schemaExpr(type.inner, opts, depth)}.nullable()`, opts.native)
    case 'ref': {
      // On the native path, INLINE the target where the dialect says nested
      // objects lower: PMTC drops a field that NAMES another schema, and an
      // inlined ref is a nested object, which its zod recogniser does lower.
      // A cycle has no finite nesting, so re-entry falls through to the name
      // and the compiler drops that one field with a warning — honest, and
      // strictly better than the whole model being dropped.
      // A NON-OBJECT model (an array, a scalar, a union) is always inlined on
      // the native path (audit G5): PMTC synthesizes structs from object
      // literals only, so a declared `const Pets = s.array(Pet)` was
      // reproduced verbatim and the native build failed on `s`.
      const target = opts.native ? opts.models?.get(type.name) : undefined
      const inline =
        target !== undefined && (dialect.inlineRefsOnNative || target.kind !== 'object')
      if (inline && opts.expanding?.has(type.name) !== true) {
        if (target) {
          const expanding = new Set(opts.expanding ?? [])
          expanding.add(type.name)
          return schemaExpr(target, { ...opts, expanding }, depth)
        }
      }
      // A back edge closes a `$ref` cycle. `const` is not hoisted, so naming
      // the target directly here is a TDZ ReferenceError at import; `lazy`
      // defers the read to first use, which is exactly what a cycle needs.
      const binding = opts.refBinding ? opts.refBinding(type.name) : type.name
      return opts.defer?.has(type.name) === true ? `${c('lazy')}(() => ${binding})` : binding
    }
    case 'array': {
      let expr = `${c('array')}(${schemaExpr(type.items, opts, depth + 1)})`
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
      if (opts.native) return `${c('string')}()`
      const members = type.options.map((o) => schemaExpr(o, opts, depth + 1))
      const inner = members.join(', ')
      // A member deferred through `lazy` has no `.shape` at construction, and
      // `discriminatedUnion` reads every member's tag field right then -- it
      // would throw at import. A plain union validates the same payloads.
      const deferred = type.options.some((o) => o.kind === 'ref' && opts.defer?.has(o.name) === true)
      if (!type.discriminator || deferred) return `${c('union')}([${inner}])`
      // A member that NAMES a model is typed as that model's `Schema<X>` (see
      // `emitSchemas`), which a discriminated union's signature rejects -- it
      // needs the object-schema type to read the discriminant's values. At
      // runtime the const IS an object schema, so the member is cast back to
      // one and the call's result is cast to the union of the members' types,
      // which is what it validates.
      const named = type.options.map((o, i) => o.kind === 'ref' && members[i] === o.name)
      if (!named.some(Boolean)) return `${c('discriminatedUnion')}(${q(type.discriminator)}, [${inner}])`
      const cast = members.map((m, i) => (named[i] ? `(${m} as unknown as ${dialect.objectSchemaRef})` : m))
      return `(${c('discriminatedUnion')}(${q(type.discriminator)}, [${cast.join(', ')}]) as unknown as ${dialect.schemaTypeRef(tsType(type, depth, dialect.enumWidensToString, false, false, dialect.emptyObjectType))})`
    }
    case 'object': {
      if (type.fields.length === 0) {
        return type.additional && !opts.native
          ? `${c('record')}(${c('string')}(), ${schemaExpr(type.additional, opts, depth + 1)})`
          : `${c('object')}({})`
      }
      const pad = '  '.repeat(depth + 1)
      const close = '  '.repeat(depth)
      const body = type.fields.map((f) => `${pad}${propKey(f.name)}: ${fieldSchema(f, opts, depth + 1)},`).join('\n')
      // Declared properties AND an `additionalProperties` schema: the extra
      // keys are typed too. Dropping the map part accepted any value there.
      const rest = type.additional && !opts.native ? `.catchall(${schemaExpr(type.additional, opts, depth + 1)})` : ''
      return `${c('object')}({\n${body}\n${close}})${rest}`
    }
  }
}

function stringExpr(type: IrStringType, b: string, p: string, uriCheck: string): string {
  let expr: string
  switch (type.format) {
    // The `.email()` / `.uuid()` chain is DEPRECATED in zod 4 in favour of
    // top-level `z.email()`, and emitted anyway: the chained form works in
    // both zod 3 and zod 4 while the top-level form exists only in 4. Picking
    // the newer spelling would silently narrow the zod versions this output
    // compiles against, and the failure would land in the consumer's repo.
    case 'email':
      expr = `${p}${b}.string().email()`
      break
    case 'uuid':
      expr = `${p}${b}.string().uuid()`
      break
    // OpenAPI's `uri` is RFC 3986: any scheme. `@pyreon/validate`'s bare
    // `.url()` accepts only http(s), so a valid URI such as
    // `git:git.example.com/x` (GitHub's `mirror_url`) was rejected; the
    // dialect spells the any-scheme form (`.url({ protocol })` there, plain
    // `.url()` on zod, which already accepts any scheme). The SAME spelling on
    // the native path: PMTC lowers each library's rule faithfully.
    case 'uri':
      expr = `${p}${b}.string()${uriCheck}`
      break
    // `date` / `date-time` stay strings deliberately: a date schema does not
    // lower, and parsing to a Date on web and a String on native is a
    // divergence no consumer can see coming.
    default:
      expr = `${p}${b}.string()`
  }
  // Length and pattern checks LOWER natively (PMTC emits them into the schema
  // struct's parse), so they are kept on both paths.
  if (type.minLength !== undefined) expr += `.min(${type.minLength})`
  if (type.maxLength !== undefined) expr += `.max(${type.maxLength})`
  if (type.pattern && portableRegex(type.pattern)) expr += `.regex(${regexLiteral(type.pattern)})`
  return expr
}

function numberExpr(type: IrNumberType, b: string, native: boolean, p: string): string {
  let expr = type.integer ? `${p}${b}.number().int()` : `${p}${b}.number()`
  // Inclusive bounds lower natively; the strict / step checks below are not
  // in PMTC's recognised chain, so the native path stops here.
  if (type.minimum !== undefined) expr += `.min(${type.minimum})`
  if (type.maximum !== undefined) expr += `.max(${type.maximum})`
  if (native) return expr
  if (type.exclusiveMinimum !== undefined) expr += `.gt(${type.exclusiveMinimum})`
  if (type.exclusiveMaximum !== undefined) expr += `.lt(${type.exclusiveMaximum})`
  // Both libraries decide a FRACTIONAL step float-safely (`@pyreon/validate`
  // since its `multipleOf` stopped using a bare `%`), so `19.99` passes
  // `.multipleOf(0.01)` on both.
  if (type.multipleOf !== undefined) expr += `.multipleOf(${type.multipleOf})`
  return expr
}

/**
 * An enum / const.
 *
 * All-string -> `enum([...])`; one value -> `literal(v)`; anything else -> a
 * union of literals. Never a `string()` with constraints chained on: that was
 * `s.enum([...]).min(3)`, a TypeError at import time.
 */
function enumExpr(values: readonly IrLiteral[], b: string, native: boolean, p: string): string {
  if (native) {
    const kinds = new Set(values.map((v) => typeof v))
    if (kinds.size === 1 && kinds.has('number')) return `${p}${b}.number()`
    if (kinds.size === 1 && kinds.has('boolean')) return `${p}${b}.boolean()`
    return `${p}${b}.string()`
  }
  const lit = (v: IrLiteral): string => (v === null ? `${p}${b}.null()` : `${p}${b}.literal(${typeof v === 'string' ? q(v) : String(v)})`)
  if (values.length === 1) return lit(values[0] as IrLiteral)
  if (values.every((v) => typeof v === 'string')) return `${p}${b}.enum([${values.map((v) => q(v as string)).join(', ')}])`
  return `${p}${b}.union([${values.map(lit).join(', ')}])`
}

function fieldSchema(field: IrField, opts: SchemaExprOptions, depth: number): string {
  const expr = schemaExpr(field.type, opts, depth)
  return field.required ? expr : purify(`${expr}.optional()`, opts.native)
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

/**
 * Emit `schemas.ts` — one type and one schema per model.
 *
 * The TYPE is written out as a plain interface (or alias), and the schema const
 * is typed AS that interface's schema rather than inferred from its own
 * initializer:
 *
 * ```ts
 * export interface Book { id: string; title: string }
 * export const Book = s.object({ id: s.string(), title: s.string() }) as unknown as Schema<Book>
 * ```
 *
 * The inferred form (`export type Book = Infer<typeof Book>`) made every
 * consumer's TypeScript re-derive every model from the builder types of a
 * thousand nested schemas. Measured on the generated schemas + client + queries
 * (tsc 6.0.3, instantiations, deterministic):
 *
 * | spec | inferred | interface + cast |
 * | --- | ---: | ---: |
 * | Stripe (`@pyreon/validate`) | 1,372,857 | 531,466 |
 * | Stripe (zod) | 1,043,674 | 300,727 |
 * | GitHub (`@pyreon/validate`) | 1,947,953 | 1,409,214 |
 *
 * ANNOTATING instead (`const Book: Schema<Book> = …`) was measured too and is
 * WORSE than inferring (Stripe 1.17M -> 1.49M on schemas alone, GitHub 1.60M ->
 * 2.61M): an annotation keeps the initializer's type AND adds an assignability
 * check against it. A plain `as Schema<Book>` pays a comparability check that
 * costs about as much. `as unknown as` is the form that stops the checker from
 * relating the two -- which is exactly why agreement between the interface and
 * the schema is NOT checked here, by construction. It is checked by lathe's own
 * test suite instead (`emitSchemaAgreement`), because both halves come from the
 * one IR walk below and a disagreement is a generator bug, not a consumer one.
 *
 * The cast also removes a class of errors: a model inside a `$ref` cycle used
 * to have its type inferred THROUGH the cycle, and TypeScript answered with
 * `Property 'nullable' does not exist on type 'UnionSchema<…>'` on Stripe's
 * expandable fields. Nothing is inferred through anything now.
 *
 * What a consumer gives up is the schema's precise builder type: `Book` is a
 * `Schema<Book>`, so `.parse`, `.optional()`, `.nullable()`, `.array()` and
 * Standard Schema all work, but object-only builders (`.extend`, `.pick`) do
 * not type-check on a generated schema. Compose a new schema around it instead.
 */
export function emitSchemas(
  doc: IrDocument,
  opts: { native: boolean; validator?: ValidatorName | undefined },
): SourceFile[] {
  if (doc.models.length === 0) return []
  const dialect = dialectOf(opts.validator ?? 'pyreon')
  const { modules, moduleOf } = schemaModules(doc)
  const { backEdges } = topoSortModels(doc)
  const byName = modelIndex(doc)
  const files: SourceFile[] = []

  for (const mod of modules) {
    const f = new SourceFile(mod.path)
    f.import(dialect.module, dialect.binding)
    if (dialect.schemaTypeImport) {
      f.importType(dialect.schemaTypeImport.module, dialect.schemaTypeImport.name)
    }
    const needsObjectType = { value: false }
    // A model named by this module but declared in ANOTHER one is imported
    // from there -- and only from there, so importing one model reaches only
    // the models it actually references.
    for (const member of mod.members) {
      const refs = new Set<string>()
      const model = byName.get(member)
      if (model) schemaRefs(model.type, refs)
      for (const dep of refs) {
        const home = moduleOf.get(dep)
        if (home && home !== mod) f.import(relativeSpecifier(mod.path, home.path), dep)
      }
    }
    // DEPENDENCY ORDER within the module. These are `const` declarations and
    // `const` is not hoisted, so a model emitted before one it references
    // throws `Cannot access 'X' before initialization` on import.
    for (const name of mod.members) {
      const model = byName.get(name)
      if (!model) continue
      // Only the edges that close a cycle are deferred (`lazy`); they are
      // always inside one module, since a cycle is one component.
      const defer = deferredTargets(backEdges, name)
      f.line()
      f.doc(...modelDoc(model))
      f.line(typeDeclaration(model.name, model.type, dialect.enumWidensToString, dialect.emptyObjectType))
      const expr = schemaExpr(model.type, { ...opts, defer })
      if (dialect.objectSchemaImport && expr.includes(dialect.objectSchemaRef)) needsObjectType.value = true
      f.line(`export const ${model.name} = ${expr} as unknown as ${dialect.schemaTypeRef(model.name)}`)
    }
    if (needsObjectType.value && dialect.objectSchemaImport) {
      f.importType(dialect.objectSchemaImport.module, dialect.objectSchemaImport.name)
    }
    files.push(f)
  }

  // The barrel keeps `import { Book } from './gen/schemas'` working. It is a
  // re-export of every module, so importing ONE binding through it still
  // reaches only that binding's module under the emitted `sideEffects` marker.
  const barrel = new SourceFile(SCHEMA_FILE)
  barrel.line()
  barrel.doc(
    `Every schema of ${doc.title} ${doc.version}.`,
    '',
    'Each model is its own module under `./schemas/`, so importing one keeps',
    'the rest out of the bundle.',
  )
  for (const mod of modules) barrel.line(`export * from '${relativeSpecifier(SCHEMA_FILE, mod.path)}'`)
  files.push(barrel)
  return files
}

/**
 * The model names a web schema expression for `type` NAMES -- every ref at
 * any depth, `additionalProperties` included (the web renders it: a record,
 * or a `.catchall`).
 */
export function schemaRefs(type: IrType, into: Set<string>): void {
  collectRefNames(type, into)
}

/** One generated schema module and the models it declares, in order. */
export interface SchemaModule {
  /** Output path, `schemas/<Name>.ts`. */
  path: string
  /** Models declared here, dependencies first. */
  members: string[]
}

const moduleMemo = new WeakMap<IrDocument, { modules: SchemaModule[]; moduleOf: Map<string, SchemaModule> }>()

/**
 * How models are split into modules: one per strongly-connected component.
 *
 * One module per MODEL is what makes a hook's bundle proportional to what it
 * uses -- but not literally per model. A `$ref` cycle split across two ES
 * modules is an import cycle, and which side evaluates first depends on who
 * imported whom first: import `Customer` before `Source` and `Source`'s module
 * runs while `Customer` is still in its temporal dead zone. Keeping a cycle in
 * ONE module makes every inter-module edge acyclic, so evaluation order is
 * fixed by the graph rather than by the importer.
 *
 * Named after the model, or after the first member (by name) of a cycle. File
 * names are compared CASE-INSENSITIVELY, since `Foo.ts` and `FOO.ts` are one
 * file on macOS and Windows; a clash takes a numeric suffix, assigned in name
 * order so it is stable across runs.
 */
export function schemaModules(doc: IrDocument): { modules: SchemaModule[]; moduleOf: Map<string, SchemaModule> } {
  const hit = moduleMemo.get(doc)
  if (hit && hit.moduleOf.size === doc.models.length) return hit
  const deps = modelDependencies(doc)
  const component = stronglyConnected(deps)
  const { order } = topoSortModels(doc)
  const byComponent = new Map<number, string[]>()
  // Members in topological order, so declarations inside a module are safe.
  for (const name of order) {
    const c = component.get(name) as number
    const list = byComponent.get(c)
    if (list) list.push(name)
    else byComponent.set(c, [name])
  }
  const groups = [...byComponent.values()].map((members) => ({
    members,
    base: [...members].sort()[0] as string,
  }))
  groups.sort((a, b) => (a.base < b.base ? -1 : a.base > b.base ? 1 : 0))
  const used = new Set<string>()
  const modules: SchemaModule[] = []
  const moduleOf = new Map<string, SchemaModule>()
  for (const g of groups) {
    let base = g.base
    // Windows reserves these device names regardless of extension.
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `${base}_`
    let name = base
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base}_${i}`
    used.add(name.toLowerCase())
    const mod: SchemaModule = { path: `schemas/${name}.ts`, members: g.members }
    modules.push(mod)
    for (const m of g.members) moduleOf.set(m, mod)
  }
  // Modules in dependency order: the barrel re-exports them in that order,
  // which makes its own evaluation order obvious to a reader.
  const rank = new Map(order.map((n, i) => [n, i]))
  modules.sort((a, b) => (rank.get(a.members[0] as string) as number) - (rank.get(b.members[0] as string) as number))
  const out = { modules, moduleOf }
  moduleMemo.set(doc, out)
  return out
}

/** Where another generated file imports `model` from. */
export function schemaSpecifierFor(fromPath: string, model: string, doc: IrDocument): string {
  const home = schemaModules(doc).moduleOf.get(model)
  return relativeSpecifier(fromPath, home ? home.path : SCHEMA_FILE)
}

/**
 * A module that PROVES the interfaces in `schemas.ts` agree with their schemas.
 *
 * Not part of the generated output -- lathe's tests and the heavy typecheck
 * script compile it next to the output. Each model's schema expression is
 * re-emitted WITHOUT the cast and its inferred output compared, in both
 * directions, with the interface the output declares:
 *
 * ```ts
 * const Book$ = s.object({ … })
 * export const Book$agrees: Same<Infer<typeof Book$>, Book> = true
 * ```
 *
 * Mutual assignability, not one direction: a declared type WIDER than the
 * schema (an optional field the schema requires) is as much a lie as a
 * narrower one.
 */
export function emitSchemaAgreement(doc: IrDocument, validator: ValidatorName = 'pyreon'): SourceFile {
  const f = new SourceFile('schemas.agreement.ts')
  const dialect = dialectOf(validator)
  f.import(dialect.module, dialect.binding)
  if (dialect.typeHelper) f.importType(dialect.typeHelper.module, dialect.typeHelper.name)
  // A discriminated union over named models casts through these types.
  if (dialect.schemaTypeImport) f.importType(dialect.schemaTypeImport.module, dialect.schemaTypeImport.name)
  if (dialect.objectSchemaImport) f.importType(dialect.objectSchemaImport.module, dialect.objectSchemaImport.name)
  const { order, backEdges } = topoSortModels(doc)
  const byName = new Map(doc.models.map((m) => [m.name, m]))
  if (order.length > 0) f.import(relativeSpecifier(f.path, SCHEMA_FILE), ...order)
  f.line()
  f.line('type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false')
  const infer = (x: string): string =>
    dialect.typeHelper ? `${dialect.typeHelper.name}<typeof ${x}>` : `${dialect.binding}.infer<typeof ${x}>`
  for (const name of order) {
    const model = byName.get(name)
    if (!model) continue
    const expr = schemaExpr(model.type, { native: false, validator, defer: deferredTargets(backEdges, name) })
    f.line(`const ${name}$ = ${expr}`)
    f.line(`export const ${name}$agrees: Same<${infer(`${name}$`)}, ${name}> = true`)
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
    f.doc(...modelDoc(model))
    f.line(typeDeclaration(model.name, model.type))
  }
  return f
}

/**
 * `export interface X {…}` or `export type X = …`, decided from the IR KIND.
 *
 * An interface is only valid for a single object type literal. Deciding from
 * the RENDERED text (does it start with `{`?) also caught a union whose first
 * member is an inline object -- `export interface X { … } | { … }`, a parse
 * error; GitHub's `types.ts` carried 3,997 errors from it. An object with
 * typed extra keys renders `{…} & Record<…>`, which is not an interface body
 * either.
 */
export function typeDeclaration(
  name: string,
  type: IrType,
  widenEnums = false,
  emptyObject = 'Record<string, unknown>',
): string {
  if (type.kind === 'object' && type.fields.length > 0 && !type.additional) {
    // The interface body carries each field's description, example and
    // `@deprecated`, so a hover on `pet.status` explains the field.
    const body = type.fields.map((f) => {
      const docs = fieldDoc(f)
      const ts = tsType({ kind: 'object', fields: [f] }, 0, widenEnums, false, false, emptyObject)
      const line = ts.slice(2, -2) // `{\n  x: T\n}` -> `  x: T`
      if (!docs) return line
      const comment =
        docs.length === 1
          ? [`  /** ${safeBlockComment(docs[0] as string)} */`]
          : ['  /**', ...docs.flatMap((d) => safeBlockComment(d).split('\n')).map((d) => `   * ${d}`.trimEnd()), '   */']
      return [...comment, line].join('\n')
    })
    return `export interface ${name} {\n${body.join('\n')}\n}`
  }
  const rendered = tsType(type, 0, widenEnums, false, false, emptyObject)
  return `export type ${name} = ${rendered}`
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
