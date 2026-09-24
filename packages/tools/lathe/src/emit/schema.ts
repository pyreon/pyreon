/**
 * Type and schema emission.
 *
 * Two renderings of the same IR type: a TypeScript type annotation, and a
 * `@pyreon/validate` `s.*` expression. They are generated from one walk so
 * they cannot drift — the failure mode of writing them separately is a
 * declared type that the runtime schema does not actually enforce.
 */

import { deferredTargets, modelDependencies, modelIndex, stronglyConnected, topoSortModels } from '../core/graph'
import type { IrDocument, IrField, IrType } from '../core/ir'
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
 * `widenEnums` renders an enum as `string` rather than as its literal union.
 * Two callers need it, for the same underlying reason — the declared type must
 * match what the runtime schema actually produces: the native path narrows
 * enums to a plain string, and `@pyreon/validate`'s `s.enum` infers `string`
 * too. Declaring `'a' | 'b'` against either is a type the schema does not
 * enforce.
 */
export function tsType(type: IrType, depth = 0, widenEnums = false): string {
  const native = widenEnums
  switch (type.kind) {
    case 'string':
      // On the native path enums narrow to `s.string()`, so the TYPE must
      // narrow with them — otherwise the declared union and the runtime schema
      // disagree and the generated module does not compile.
      return type.enum && !native ? type.enum.map((v) => q(v)).join(' | ') : 'string'
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
    case 'array': {
      const inner = tsType(type.items, depth + 1, native)
      // `A | B[]` parses as `A | (B[])`, so a union element needs parens.
      return /[|&]/.test(inner) ? `(${inner})[]` : `${inner}[]`
    }
    case 'union':
      return type.options.map((o) => tsType(o, depth + 1, native)).join(' | ')
    case 'object': {
      if (type.fields.length === 0) {
        return type.additional ? `Record<string, ${tsType(type.additional, depth + 1, native)}>` : 'Record<string, unknown>'
      }
      const pad = '  '.repeat(depth + 1)
      const close = '  '.repeat(depth)
      const body = type.fields
        .map((f) => `${pad}${propKey(f.name)}${f.required ? '' : '?'}: ${fieldTs(f, depth + 1, native)}`)
        .join('\n')
      return `{\n${body}\n${close}}`
    }
  }
}

function fieldTs(field: IrField, depth: number, native = false): string {
  const base = tsType(field.type, depth, native)
  const withNull = field.nullable ? `${base} | null` : base
  // `exactOptionalPropertyTypes` is on across this repo and in the consumer
  // presets, where `x?: number` and `x?: number | undefined` are DIFFERENT
  // types. The schema infers the second, so the emitted type must say it — or
  // the generated module fails to typecheck against its own schema.
  return field.required ? withNull : `${withNull} | undefined`
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
 * Render an IR type as an `s.*` expression.
 *
 * `native` narrows the output to the subset PMTC lowers. The difference is not
 * cosmetic: on the native path an enum becomes `s.string()` and the constraint
 * is LOST there, so callers must report that rather than let a reader assume
 * the two targets validate identically.
 */
export function schemaExpr(type: IrType, opts: SchemaExprOptions, depth = 0): string {
  const dialect = dialectOf(opts.validator ?? 'pyreon')
  const b = dialect.binding
  // Every builder CALL is annotated pure (web only -- the native recognizers
  // read these files, and they are not bundled). See `PURE` for why.
  const c = (ctor: string): string => `${opts.native ? '' : PURE}${b}.${ctor}`
  switch (type.kind) {
    case 'string': {
      if (type.enum && !opts.native) return `${c('enum')}([${type.enum.map((v) => q(v)).join(', ')}])`
      if (type.enum && opts.native) return `${c('string')}()`
      switch (type.format) {
        // The `.email()` / `.url()` / `.uuid()` chain is DEPRECATED in zod 4 in
        // favour of top-level `z.email()`, and emitted anyway: the chained form
        // works in both zod 3 and zod 4 while the top-level form exists only in
        // 4. Picking the newer spelling would silently narrow the zod versions
        // this output compiles against, and the failure would land in the
        // consumer's repo rather than here.
        case 'email':
          return `${c('string')}().email()`
        case 'uri':
          return `${c('string')}().url()`
        case 'uuid':
          return `${c('string')}().uuid()`
        // `date` / `date-time` stay strings deliberately: a date schema does
        // not lower, and parsing to a Date on web and a String on native is a
        // divergence no consumer can see coming.
        default:
          return `${c('string')}()`
      }
    }
    case 'number':
      return type.integer ? `${c('number')}().int()` : `${c('number')}()`
    case 'boolean':
      return `${c('boolean')}()`
    case 'null':
      return opts.native ? `${c('string')}()` : `${c('null')}()`
    case 'unknown':
      return opts.native ? `${c('string')}()` : `${c('unknown')}()`
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
      return opts.defer?.has(type.name) === true ? `${c('lazy')}(() => ${type.name})` : type.name
    }
    case 'array':
      return `${c('array')}(${schemaExpr(type.items, opts, depth + 1)})`
    case 'union': {
      if (opts.native) return `${c('string')}()`
      const members = type.options.map((o) => schemaExpr(o, opts, depth + 1))
      const inner = members.join(', ')
      if (!type.discriminator) return `${c('union')}([${inner}])`
      // A member that NAMES a model is typed as that model's `Schema<X>` (see
      // `emitSchemas`), which a discriminated union's signature rejects -- it
      // needs the object-schema type to read the discriminant's values. At
      // runtime the const IS an object schema, so the member is cast back to
      // one and the call's result is cast to the union of the members' types,
      // which is what it validates. A DEFERRED member (`lazy`, closing a
      // cycle) is not an object schema at runtime and cannot be dispatched on
      // eagerly, so that union stays a plain one.
      const named = type.options.map((o, i) => o.kind === 'ref' && members[i] === o.name)
      if (!named.some(Boolean)) return `${c('discriminatedUnion')}(${q(type.discriminator)}, [${inner}])`
      if (type.options.some((o, i) => o.kind === 'ref' && !named[i])) return `${c('union')}([${inner}])`
      const cast = members.map((m, i) => (named[i] ? `(${m} as unknown as ${dialect.objectSchemaRef})` : m))
      return `(${c('discriminatedUnion')}(${q(type.discriminator)}, [${cast.join(', ')}]) as unknown as ${dialect.schemaTypeRef(tsType(type, depth, dialect.enumWidensToString))})`
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
      return `${c('object')}({\n${body}\n${close}})`
    }
  }
}

function fieldSchema(field: IrField, opts: SchemaExprOptions, depth: number): string {
  const base = schemaExpr(field.type, opts, depth)
  let expr = base
  // Constraints only attach to the kinds that carry them.
  if (field.type.kind === 'string') {
    if (typeof field.min === 'number') expr += `.min(${field.min})`
    if (typeof field.max === 'number') expr += `.max(${field.max})`
    if (field.pattern && portableRegex(field.pattern)) expr += `.regex(${regexLiteral(field.pattern)})`
  } else if (field.type.kind === 'number') {
    if (typeof field.min === 'number') expr += `.min(${field.min})`
    if (typeof field.max === 'number') expr += `.max(${field.max})`
  }
  if (field.nullable) expr += '.nullable()'
  if (!field.required) expr += '.optional()'
  // A chain on a bare model NAME (`Author.optional()`) is a method call the
  // bundler cannot prove pure, and it sits inside the enclosing
  // `s.object({ … })` arguments -- so without its own annotation it pinned the
  // whole enclosing model into every bundle that reached its module. An
  // expression already starting with a builder call carries the annotation.
  if (!opts.native && expr !== base && !expr.startsWith(PURE)) expr = `${PURE}${expr}`
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
      f.doc(model.doc)
      f.line(typeDeclaration(model.name, model.type, dialect.enumWidensToString))
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
    'One module per model (a `$ref` cycle shares one), so a hook reaches only',
    'the schemas its response actually names -- see `./schemas/`.',
  )
  for (const mod of modules) barrel.line(`export * from '${relativeSpecifier(SCHEMA_FILE, mod.path)}'`)
  files.push(barrel)
  return files
}

/**
 * The model names a web schema expression for `type` actually NAMES.
 *
 * Mirrors `schemaExpr`'s non-native branches exactly -- in particular an
 * object WITH fields drops `additionalProperties`, so a model referenced only
 * there is not named and must not be imported (an unused import is a lint
 * error in the consumer's repo, in a file nobody wrote).
 */
export function schemaRefs(type: IrType, into: Set<string>): void {
  switch (type.kind) {
    case 'ref':
      into.add(type.name)
      return
    case 'array':
      schemaRefs(type.items, into)
      return
    case 'union':
      for (const o of type.options) schemaRefs(o, into)
      return
    case 'object':
      if (type.fields.length === 0) {
        if (type.additional) schemaRefs(type.additional, into)
      } else {
        for (const f of type.fields) schemaRefs(f.type, into)
      }
      return
    default:
  }
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
    f.doc(model.doc)
    f.line(typeDeclaration(model.name, model.type))
  }
  return f
}

/**
 * `export interface X {…}` or `export type X = …`, decided from the IR KIND.
 *
 * An interface is only valid for a single object type literal. This used to
 * test whether the RENDERED text started with `{`, which a union whose first
 * member is an inline object also does -- `export interface X { … } | { … }`
 * is a parse error, and GitHub's `types.ts` carried 3,997 errors from it.
 */
export function typeDeclaration(name: string, type: IrType, widenEnums = false): string {
  const rendered = tsType(type, 0, widenEnums)
  return type.kind === 'object' && type.fields.length > 0
    ? `export interface ${name} ${rendered}`
    : `export type ${name} = ${rendered}`
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
  return undefined
}

/** A readable TS name for an operation's response. */
export function responseTypeName(type: IrType | undefined): string {
  if (!type) return 'void'
  return tsType(type)
}

export { typeIdent }
