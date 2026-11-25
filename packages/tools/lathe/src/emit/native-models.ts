/**
 * Plain native model types: Swift `Codable` structs and Kotlin
 * `@Serializable` (kotlinx.serialization) data classes, from the IR's models.
 *
 * The `swift` and `kotlin` plugins. They are for an app whose iOS / Android
 * clients already exist natively (own networking, own views) and want the
 * API contract's TYPES from the same spec as the web client, so the three
 * cannot drift. Nothing here depends on Pyreon at run time: the Swift file
 * needs Foundation, the Kotlin file kotlinx-serialization-json.
 *
 * Two layers, so the platforms cannot disagree about the SHAPE:
 *
 *  1. {@link lowerModels} turns the IR into a small list of declarations
 *     (struct / enum / union / alias) over a handful of native types. Every
 *     inline object, enum and union is hoisted to a named top-level
 *     declaration here (`Pet.status` -> `PetStatus`), with ONE global namer,
 *     so a hoisted name can never shadow a model or a type the printers name.
 *  2. A printer per language renders that list. Only spelling differs.
 *
 * What does NOT map, stated rather than approximated (the docs page lists it
 * too):
 *  - an object with BOTH properties and `additionalProperties` keeps the
 *    properties; the extra keys are dropped (a comment on the type says so);
 *  - an enum mixing value types is typed as the JSON value type;
 *  - Kotlin has no integer-valued enum in kotlinx.serialization (enums cross
 *    as their NAME), so an integer enum is a `Long` typealias with the allowed
 *    values in its KDoc. Swift gets a real `enum X: Int`;
 *  - a union is TAGGED (dispatch on the discriminator's value) only when every
 *    member is an object whose discriminator property has fixed values;
 *    otherwise it is UNTAGGED: the first member, in spec order (integers
 *    before numbers), that decodes wins;
 *  - `format: date-time` is a `Date` in Swift (decode with `LatheJSON.decoder`,
 *    which reads RFC 3339 with and without fractional seconds) and a `String`
 *    in Kotlin (no extra dependency; parse with kotlinx-datetime or
 *    `java.time` if you need an instant);
 *  - webhook / callback payloads and inline operation types are not emitted:
 *    only `components.schemas` models (and the request/response splits Lathe
 *    derives from them).
 */

import type { IrDocument, IrField, IrLiteral, IrModel, IrType } from '../core/ir'
import { camel, ident, pascal } from '../core/naming'
import type { GeneratedFile } from './writer'
import { CONTROL_CHARS, safeBlockComment, safeLineComment } from './writer'

/* ------------------------------------------------------------------ */
/* Layer 1: the shared lowering                                        */
/* ------------------------------------------------------------------ */

/** A type as both platforms can spell it. */
export type NativeType =
  | { k: 'string' }
  | { k: 'int' }
  | { k: 'int64' }
  | { k: 'double' }
  | { k: 'bool' }
  | { k: 'date' }
  /** Any JSON value: Swift `JSONValue`, Kotlin `JsonElement`. */
  | { k: 'json' }
  | { k: 'named'; name: string }
  | { k: 'array'; of: NativeType }
  | { k: 'map'; of: NativeType }
  | { k: 'optional'; of: NativeType }

export interface NativeField {
  /** The key on the wire, verbatim. */
  wire: string
  type: NativeType
  required: boolean
  doc?: string | undefined
}

export interface NativeVariant {
  type: NativeType
  /** A name for the case: the model's name, or a word for a primitive. */
  label: string
  /** Tagged unions only: the discriminator values that select this variant. */
  tags?: readonly string[] | undefined
}

export type NativeDecl =
  | {
      kind: 'struct'
      name: string
      doc?: string | undefined
      fields: NativeField[]
      /** Set when the object also declared `additionalProperties`, which is dropped. */
      droppedAdditional: boolean
      /** On a struct-only cycle: Swift must emit a class (a struct cannot contain itself). */
      recursive: boolean
    }
  | { kind: 'enum'; name: string; doc?: string | undefined; raw: 'string' | 'int'; values: (string | number)[] }
  | {
      kind: 'union'
      name: string
      doc?: string | undefined
      variants: NativeVariant[]
      /** The discriminator's wire name, when the union is tagged. */
      discriminator?: string | undefined
      /** Why a declared discriminator could not be used. */
      untaggedReason?: string | undefined
      /** Kotlin: the name of the generated `KSerializer` object. */
      serializer: string
    }
  | { kind: 'alias'; name: string; doc?: string | undefined; type: NativeType; note?: string | undefined }

export interface NativeModels {
  decls: NativeDecl[]
  usesJson: boolean
  usesDate: boolean
}

/**
 * Type names the printers reference. A model with one of these names is
 * renamed (`<Name>Model`): a model called `List` would otherwise capture every
 * `List<…>` in the Kotlin file, and one called `Date` every Swift `Date`.
 */
const NATIVE_RESERVED = new Set([
  // Swift
  'String', 'Int', 'Int64', 'Double', 'Bool', 'Date', 'Codable', 'Decoder', 'Encoder', 'CodingKey',
  'CodingKeys', 'DecodingError', 'EncodingError', 'JSONDecoder', 'JSONEncoder', 'ISO8601DateFormatter',
  'Foundation', 'Optional', 'Array', 'Dictionary', 'Swift', 'JSONValue', 'LatheJSON', 'Self', 'Type',
  'Protocol', 'Any', 'AnyObject', 'Never', 'Void', 'Error',
  // Kotlin
  'Long', 'Boolean', 'List', 'Map', 'Unit', 'Nothing', 'Serializable', 'SerialName', 'KSerializer',
  'SerialDescriptor', 'SerializationException', 'Json', 'JsonElement', 'JsonObject', 'JsonPrimitive',
  'JsonDecoder', 'JsonEncoder', 'LatheJson', 'IllegalArgumentException', 'Exception', 'kotlin',
  'kotlinx',
])

/** One namespace for every top-level declaration, so nothing shadows anything. */
class Namer {
  private readonly taken = new Set<string>()

  constructor(reserved: Iterable<string>) {
    for (const r of reserved) this.taken.add(r.toLowerCase())
  }

  /**
   * Claim `want`, or the first free `want2`, `want3`…. Compared
   * case-insensitively: two Swift types differing only in case are legal, but
   * a reader confuses them and a case-insensitive file system does not care.
   */
  claim(want: string): string {
    let name = want
    for (let i = 2; this.taken.has(name.toLowerCase()); i++) name = `${want}${i}`
    this.taken.add(name.toLowerCase())

    return name
  }
}

/** Lower the document's models to declarations both printers share. */
export function lowerModels(ir: IrDocument): NativeModels {
  const lowerer = new Lowerer(ir)
  for (const m of ir.models) lowerer.model(m)
  markRecursive(lowerer.decls)

  return { decls: lowerer.decls, usesJson: lowerer.usesJson, usesDate: lowerer.usesDate }
}

type IrUnion = Extract<IrType, { kind: 'union' }>
type IrObject = Extract<IrType, { kind: 'object' }>

/** The state of one lowering: the namer, the declarations so far, what the file needs. */
class Lowerer {
  readonly decls: NativeDecl[] = []
  usesJson = false
  usesDate = false
  private readonly namer = new Namer(NATIVE_RESERVED)
  /** Every model keeps its IR name unless that name is one the printers use. */
  private readonly modelName = new Map<string, string>()
  private readonly models: ReadonlyMap<string, IrModel>

  constructor(ir: IrDocument) {
    for (const m of ir.models) {
      this.modelName.set(m.name, this.namer.claim(NATIVE_RESERVED.has(m.name) ? `${m.name}Model` : m.name))
    }
    this.models = new Map(ir.models.map((m) => [m.name, m]))
  }

  /** One model: a root object / enum / union becomes THE declaration, anything else an alias. */
  model(m: IrModel): void {
    const name = this.modelName.get(m.name) as string
    const doc = modelDoc(m)
    const t = m.type
    if (t.kind === 'object') {
      this.object(t, name, doc, name)
      return
    }
    if (t.kind === 'union') {
      this.union(t, name, doc, name)
      return
    }
    if (t.kind === 'enum' && this.rootEnum(t.values, name, doc)) return
    const at = this.decls.length
    // Hinted with the model's own name: an array's item becomes `<Name>Item`,
    // and a direct inline shape (claimed already) falls back to `<Name>2`.
    const type = this.type(t, name, doc)
    this.decls.splice(at, 0, { kind: 'alias', name, doc, type })
  }

  /** A root enum of only strings or only integers is a real enum under the model's name. */
  private rootEnum(values: readonly IrLiteral[], name: string, doc: string | undefined): boolean {
    const present = values.filter((v) => v !== null)
    const ints = present.every((v) => typeof v === 'number' && Number.isSafeInteger(v))
    const strings = present.every((v) => typeof v === 'string')
    if (present.length !== values.length || present.length === 0 || !(strings || ints)) return false
    this.decls.push({ kind: 'enum', name, doc, raw: strings ? 'string' : 'int', values: dedupe(present as (string | number)[]) })

    return true
  }

  type(t: IrType, hint: string, doc?: string): NativeType {
    switch (t.kind) {
      case 'string':
        if (t.format !== 'date-time') return { k: 'string' }
        this.usesDate = true
        return { k: 'date' }
      case 'number':
        return t.integer ? { k: 'int' } : { k: 'double' }
      case 'bigint':
        return { k: 'int64' }
      case 'boolean':
        return { k: 'bool' }
      case 'null':
      case 'unknown':
        this.usesJson = true
        return t.kind === 'null' ? { k: 'optional', of: { k: 'json' } } : { k: 'json' }
      case 'enum':
        return this.enum(t.values, hint, doc)
      case 'array':
        return { k: 'array', of: this.type(t.items, `${hint}Item`) }
      case 'object':
        return this.object(t, hint, undefined)
      case 'ref':
        return { k: 'named', name: this.modelName.get(t.name) ?? t.name }
      case 'union':
        return this.union(t, hint, undefined)
      case 'nullable': {
        const inner = this.type(t.inner, hint, doc)
        return inner.k === 'optional' ? inner : { k: 'optional', of: inner }
      }
      default: {
        const exhaustive: never = t
        return exhaustive
      }
    }
  }

  /** Follow refs to the type that defines a shape. */
  private resolve(t: IrType, seen = new Set<string>()): IrType {
    if (t.kind !== 'ref' || seen.has(t.name)) return t
    seen.add(t.name)
    const m = this.models.get(t.name)

    return m ? this.resolve(m.type, seen) : t
  }

  private enum(values: readonly IrLiteral[], hint: string, doc?: string): NativeType {
    const present = values.filter((v): v is Exclude<IrLiteral, null> => v !== null)
    const wrap = (t: NativeType): NativeType => (present.length < values.length ? { k: 'optional', of: t } : t)
    const some = present.length > 0
    const strings = some && present.every((v) => typeof v === 'string')
    // A single string is a constant (a discriminator tag, a `const`): a
    // one-case enum per tag is noise, and the value is in the doc comment.
    if (strings && present.length === 1) return wrap({ k: 'string' })
    const ints = some && present.every((v) => typeof v === 'number' && Number.isSafeInteger(v))
    if (strings || ints) {
      const name = this.namer.claim(hint)
      this.decls.push({ kind: 'enum', name, doc, raw: strings ? 'string' : 'int', values: dedupe(present as (string | number)[]) })
      return wrap({ k: 'named', name })
    }
    if (some && present.every((v) => typeof v === 'number')) return wrap({ k: 'double' })
    if (some && present.every((v) => typeof v === 'boolean')) return wrap({ k: 'bool' })
    this.usesJson = true

    return some ? wrap({ k: 'json' }) : { k: 'optional', of: { k: 'json' } }
  }

  /** The discriminator values each member pins, or why the union cannot be tagged. */
  private tagsOf(options: readonly IrType[], key: string): string[][] | string {
    const out: string[][] = []
    for (const o of options) {
      const shape = this.resolve(o)
      if (shape.kind !== 'object') return 'a member is not an object'
      const field = shape.fields.find((f) => f.name === key)
      if (!field) return `a member has no \`${key}\` property`
      const ft = this.resolve(field.type)
      if (ft.kind !== 'enum' || !ft.values.every((v) => typeof v === 'string')) {
        return `a member's \`${key}\` is not a fixed string`
      }
      out.push(ft.values as string[])
    }
    const all = out.flat()

    return new Set(all).size === all.length ? out : 'two members share a discriminator value'
  }

  private union(t: IrUnion, hint: string, doc: string | undefined, claimed?: string): NativeType {
    const name = claimed ?? this.namer.claim(hint)
    const serializer = this.namer.claim(`${name}Serializer`)
    // Pushed before the members are lowered, so a hoisted member sorts after it.
    const decl: Extract<NativeDecl, { kind: 'union' }> = { kind: 'union', name, doc, variants: [], serializer }
    this.decls.push(decl)
    const tags = t.discriminator !== undefined ? this.tagsOf(t.options, t.discriminator) : undefined
    if (typeof tags === 'string') decl.untaggedReason = `discriminator \`${t.discriminator}\`: ${tags}`
    else if (tags) decl.discriminator = t.discriminator
    const labels = new Set<string>()
    const variants: NativeVariant[] = t.options.map((o, i) => {
      const type = this.type(o, `${name}Option${i + 1}`)
      let label = variantLabel(type)
      for (let n = 2; labels.has(label.toLowerCase()); n++) label = `${variantLabel(type)}${n}`
      labels.add(label.toLowerCase())

      return Array.isArray(tags) ? { type, label, tags: tags[i] } : { type, label }
    })
    // Untagged: doubles after everything else, or `1` would always decode as a double.
    if (!decl.discriminator) variants.sort((a, b) => Number(a.type.k === 'double') - Number(b.type.k === 'double'))
    decl.variants = variants

    return { k: 'named', name }
  }

  private object(t: IrObject, hint: string, doc: string | undefined, claimed?: string): NativeType {
    if (t.fields.length === 0 && t.additional) {
      if (!claimed) return { k: 'map', of: this.type(t.additional, `${hint}Value`) }
      const of = this.type(t.additional, `${claimed}Value`)
      this.decls.push({ kind: 'alias', name: claimed, doc, type: { k: 'map', of } })

      return { k: 'named', name: claimed }
    }
    const name = claimed ?? this.namer.claim(hint)
    const decl: Extract<NativeDecl, { kind: 'struct' }> = {
      kind: 'struct',
      name,
      doc,
      fields: [],
      droppedAdditional: t.additional !== undefined,
      recursive: false,
    }
    this.decls.push(decl)
    // A hoisted inline enum carries its field's description.
    decl.fields = t.fields.map((f) => ({
      wire: f.name,
      type: this.type(f.type, `${name}${pascal(f.name)}`, f.doc),
      required: f.required,
      doc: fieldDoc(f),
    }))

    return { k: 'named', name }
  }
}

/** The values, first occurrence kept (a spec may repeat one). */
function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/** A case label for a union variant. */
function variantLabel(t: NativeType): string {
  switch (t.k) {
    case 'named':
      return t.name
    case 'string':
      return 'StringValue'
    case 'int':
    case 'int64':
      return 'IntValue'
    case 'double':
      return 'DoubleValue'
    case 'bool':
      return 'BoolValue'
    case 'date':
      return 'DateValue'
    case 'json':
      return 'JsonValue'
    case 'array':
      return 'ListValue'
    case 'map':
      return 'MapValue'
    case 'optional':
      return variantLabel(t.of)
  }
}

/**
 * A Swift struct cannot contain itself, directly or through an Optional (only
 * through an array or a dictionary, which box their elements). Mark every
 * struct on such a cycle; the Swift printer emits it as a `final class`.
 * Unions are `indirect enum`s, so a cycle through one is already boxed.
 */
function markRecursive(decls: NativeDecl[]): void {
  const structs = new Map<string, Extract<NativeDecl, { kind: 'struct' }>>()
  for (const d of decls) if (d.kind === 'struct') structs.set(d.name, d)
  const aliases = new Map<string, NativeType>()
  for (const d of decls) if (d.kind === 'alias') aliases.set(d.name, d.type)
  const edges = (s: Extract<NativeDecl, { kind: 'struct' }>): string[] => {
    const out: string[] = []
    const visit = (t: NativeType, seen: Set<string>): void => {
      if (t.k === 'optional') visit(t.of, seen)
      else if (t.k === 'named') {
        if (structs.has(t.name)) out.push(t.name)
        const alias = aliases.get(t.name)
        if (alias && !seen.has(t.name)) visit(alias, new Set([...seen, t.name]))
      }
    }
    for (const f of s.fields) visit(f.type, new Set())

    return out
  }
  for (const s of structs.values()) {
    // DFS from s: does any path return to s?
    const stack = [...edges(s)]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const n = stack.pop() as string
      if (n === s.name) {
        s.recursive = true
        break
      }
      if (seen.has(n)) continue
      seen.add(n)
      stack.push(...edges(structs.get(n) as Extract<NativeDecl, { kind: 'struct' }>))
    }
  }
}

function modelDoc(m: IrModel): string | undefined {
  const parts = [m.doc, m.deprecated ? 'Deprecated.' : undefined].filter((p): p is string => !!p)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

function fieldDoc(f: IrField): string | undefined {
  const parts: string[] = []
  if (f.doc) parts.push(f.doc)
  if (f.type.kind === 'enum' && f.type.values.length === 1 && typeof f.type.values[0] === 'string') {
    parts.push(`Always \`${f.type.values[0]}\`.`)
  }
  if (f.deprecated) parts.push('Deprecated.')

  return parts.length > 0 ? parts.join('\n\n') : undefined
}


/* ------------------------------------------------------------------ */
/* Shared printer helpers                                              */
/* ------------------------------------------------------------------ */

/** Options for the `swift` / `kotlin` plugins — see `LatheSection.nativeModels`. */
export interface NativeModelsOptions {
  /** Kotlin `package` of the generated file. Default `api`. */
  kotlinPackage?: string | undefined
  /** Swift access level of every generated declaration. Default `internal`. */
  swiftAccess?: 'internal' | 'public' | undefined
}

export const SWIFT_MODELS_PATH = 'swift/Models.swift'
export const KOTLIN_MODELS_PATH = 'kotlin/Models.kt'

function nativeBanner(title: string, version: string): string[] {
  return [
    `// @generated by @pyreon/lathe from ${safeLineComment(title)} ${safeLineComment(version)}.`,
    '// Do not edit: change the spec and run `lathe generate`.',
  ]
}

/** Unique property / case identifiers within one declaration. */
function uniqueIdents(raw: readonly string[], derive: (s: string) => string): string[] {
  const seen = new Set<string>()
  return raw.map((r) => {
    const base = derive(r)
    let out = base
    for (let i = 2; seen.has(out); i++) out = `${base}${i}`
    seen.add(out)

    return out
  })
}

/**
 * A double-quoted string literal valid in BOTH Swift and Kotlin: backslash,
 * quote and every line terminator escaped, `$` escaped for Kotlin templates
 * (Swift spells `\$` differently, so callers pass the language).
 */
function quoted(value: string, lang: 'swift' | 'kotlin'): string {
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) as number
    if (ch === '\\') out += '\\\\'
    else if (ch === '"') out += '\\"'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (ch === '$' && lang === 'kotlin') out += '\\$'
    else if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) {
      out += lang === 'swift' ? `\\u{${code.toString(16)}}` : `\\u${code.toString(16).padStart(4, '0')}`
    } else out += ch
  }

  return `"${out}"`
}

/** `///` lines for Swift. */
function swiftDoc(doc: string | undefined, indent: string): string[] {
  if (!doc) return []
  return doc
    .replace(/[\r\u2028\u2029]/g, '\n')
    .replace(CONTROL_CHARS, '')
    .split('\n')
    .map((l) => `${indent}/// ${l}`.trimEnd())
}

/** A KDoc block for Kotlin. */
function kotlinDoc(doc: string | undefined, indent: string): string[] {
  if (!doc) return []
  const lines = safeBlockComment(doc).split('\n')
  if (lines.length === 1) return [`${indent}/** ${lines[0]} */`]

  return [`${indent}/**`, ...lines.map((l) => `${indent} * ${l}`.trimEnd()), `${indent} */`]
}

/* ------------------------------------------------------------------ */
/* Swift                                                               */
/* ------------------------------------------------------------------ */

/** The Swift file: one `Codable` declaration per model. */
export function emitSwiftModels(doc: IrDocument, options: NativeModelsOptions = {}): GeneratedFile {
  const lowered = lowerModels(doc)
  const pub = options.swiftAccess === 'public' ? 'public ' : ''
  const out: string[] = [...nativeBanner(doc.title, doc.version), '// swiftlint:disable all', '', 'import Foundation', '']
  for (const d of lowered.decls) {
    out.push(...swiftDoc(d.doc, ''))
    if (d.kind === 'alias') out.push(`${pub}typealias ${d.name} = ${swiftType(d.type)}`, '')
    else if (d.kind === 'enum') out.push(...swiftEnum(d, pub))
    else if (d.kind === 'struct') out.push(...swiftStruct(d, pub))
    else out.push(...swiftUnion(d, pub))
  }
  if (lowered.usesJson) out.push(...SWIFT_JSON_VALUE(pub))
  out.push(...SWIFT_LATHE_JSON(pub))

  return { path: SWIFT_MODELS_PATH, contents: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n` }
}

function swiftType(t: NativeType): string {
  switch (t.k) {
    case 'string':
      return 'String'
    case 'int':
      return 'Int'
    case 'int64':
      return 'Int64'
    case 'double':
      return 'Double'
    case 'bool':
      return 'Bool'
    case 'date':
      return 'Date'
    case 'json':
      return 'JSONValue'
    case 'named':
      return t.name
    case 'array':
      return `[${swiftType(t.of)}]`
    case 'map':
      return `[String: ${swiftType(t.of)}]`
    case 'optional':
      return `${swiftType(t.of)}?`
  }
}

/** A field's type as declared: an optional property is `T?` whatever the spec's nullability. */
function declaredType(f: NativeField): NativeType {
  return f.required || f.type.k === 'optional' ? f.type : { k: 'optional', of: f.type }
}

function swiftEnum(d: Extract<NativeDecl, { kind: 'enum' }>, pub: string): string[] {
  const cases = uniqueIdents(
    d.values.map(String),
    d.raw === 'string' ? (v) => ident(v) : (v) => ident(`value ${v.replace('-', 'minus ')}`),
  )

  return [
    `${pub}enum ${d.name}: ${d.raw === 'string' ? 'String' : 'Int'}, Codable, Hashable, CaseIterable {`,
    ...d.values.map((v, i) => `    case ${cases[i]} = ${typeof v === 'string' ? quoted(v, 'swift') : String(v)}`),
    '}',
    '',
  ]
}

function swiftStruct(d: Extract<NativeDecl, { kind: 'struct' }>, pub: string): string[] {
  const out: string[] = []
  if (d.droppedAdditional) {
    out.push('// lathe: this object also allows additional properties; only the declared ones are modelled.')
  }
  const props = uniqueIdents(d.fields.map((f) => f.wire), (w) => ident(w))
  const types = d.fields.map((f) => swiftType(declaredType(f)))
  out.push(`${pub}${d.recursive ? 'final class' : 'struct'} ${d.name}: Codable {`)
  d.fields.forEach((f, i) => out.push(...swiftDoc(f.doc, '    '), `    ${pub}var ${props[i]}: ${types[i]}`))
  if (d.fields.length > 0) out.push('')
  const params = d.fields.map((f, i) => `${props[i]}: ${types[i]}${f.required ? '' : ' = nil'}`)
  out.push(`    ${pub}init(${params.join(', ')}) {`, ...props.map((p) => `        self.${p} = ${p}`), '    }')
  if (d.fields.some((f, i) => f.wire !== props[i])) {
    out.push('', '    enum CodingKeys: String, CodingKey {')
    d.fields.forEach((f, i) => {
      out.push(f.wire === props[i] ? `        case ${props[i]}` : `        case ${props[i]} = ${quoted(f.wire, 'swift')}`)
    })
    out.push('    }')
  }
  out.push('}', '')

  return out
}

function swiftUnion(d: Extract<NativeDecl, { kind: 'union' }>, pub: string): string[] {
  const out: string[] = []
  if (d.untaggedReason) out.push(`// lathe: decoded untagged (first member that decodes wins) — ${safeLineComment(d.untaggedReason)}.`)
  const cases = uniqueIdents(d.variants.map((v) => v.label), (l) => ident(camel(l)))
  out.push(`${pub}indirect enum ${d.name}: Codable {`)
  d.variants.forEach((v, i) => out.push(`    case ${cases[i]}(${swiftType(v.type)})`))
  out.push('', ...(d.discriminator !== undefined ? swiftTaggedInit(d, cases, pub, d.discriminator) : swiftUntaggedInit(d, cases, pub)))
  out.push('', `    ${pub}func encode(to encoder: Encoder) throws {`, '        switch self {')
  cases.forEach((c) => out.push(`        case .${c}(let value): try value.encode(to: encoder)`))
  out.push('        }', '    }', '}', '')

  return out
}

function swiftTaggedInit(d: Extract<NativeDecl, { kind: 'union' }>, cases: string[], pub: string, key: string): string[] {
  const out = [
    `    private enum TagKey: String, CodingKey { case tag = ${quoted(key, 'swift')} }`,
    '',
    `    ${pub}init(from decoder: Decoder) throws {`,
    '        let container = try decoder.container(keyedBy: TagKey.self)',
    '        let tag = try container.decode(String.self, forKey: .tag)',
    '        switch tag {',
  ]
  d.variants.forEach((v, i) => {
    out.push(`        case ${(v.tags ?? []).map((t) => quoted(t, 'swift')).join(', ')}:`)
    out.push(`            self = .${cases[i]}(try ${swiftType(v.type)}(from: decoder))`)
  })
  // The key is a quoted literal's BODY, so `\(` in a spec key stays text.
  const keyText = quoted(key, 'swift').slice(1, -1)
  out.push(
    '        default:',
    `            throw DecodingError.dataCorruptedError(forKey: .tag, in: container, debugDescription: "Unknown ${keyText} \\(tag) for ${d.name}")`,
    '        }',
    '    }',
  )

  return out
}

function swiftUntaggedInit(d: Extract<NativeDecl, { kind: 'union' }>, cases: string[], pub: string): string[] {
  const out = [`    ${pub}init(from decoder: Decoder) throws {`]
  d.variants.forEach((v, i) => {
    out.push(`        if let value = try? ${swiftInit(v.type)}(from: decoder) {`, `            self = .${cases[i]}(value)`, '            return', '        }')
  })
  out.push(
    `        throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "No member of ${d.name} matches the value"))`,
    '    }',
  )

  return out
}

/** The type spelled so `<it>(from:)` parses: `[T]` is `Array<T>`, `T?` is `Optional<T>`. */
function swiftInit(t: NativeType): string {
  if (t.k === 'optional') return `Optional<${swiftType(t.of)}>`
  if (t.k === 'array') return `Array<${swiftType(t.of)}>`
  if (t.k === 'map') return `Dictionary<String, ${swiftType(t.of)}>`

  return swiftType(t)
}

const SWIFT_JSON_VALUE = (pub: string): string[] => [
  '/// Any JSON value — what an untyped schema (`{}`, a free-form object) decodes to.',
  `${pub}enum JSONValue: Codable, Hashable {`,
  '    case null',
  '    case bool(Bool)',
  '    case number(Double)',
  '    case string(String)',
  '    case array([JSONValue])',
  '    case object([String: JSONValue])',
  '',
  `    ${pub}init(from decoder: Decoder) throws {`,
  '        let container = try decoder.singleValueContainer()',
  '        if container.decodeNil() { self = .null }',
  '        else if let value = try? container.decode(Bool.self) { self = .bool(value) }',
  '        else if let value = try? container.decode(Double.self) { self = .number(value) }',
  '        else if let value = try? container.decode(String.self) { self = .string(value) }',
  '        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }',
  '        else { self = .object(try container.decode([String: JSONValue].self)) }',
  '    }',
  '',
  `    ${pub}func encode(to encoder: Encoder) throws {`,
  '        var container = encoder.singleValueContainer()',
  '        switch self {',
  '        case .null: try container.encodeNil()',
  '        case .bool(let value): try container.encode(value)',
  '        case .number(let value): try container.encode(value)',
  '        case .string(let value): try container.encode(value)',
  '        case .array(let value): try container.encode(value)',
  '        case .object(let value): try container.encode(value)',
  '        }',
  '    }',
  '}',
  '',
]

const SWIFT_LATHE_JSON = (pub: string): string[] => [
  '/// A decoder and an encoder configured for these models: `date-time` fields',
  '/// read RFC 3339 with or without fractional seconds, and are written with them.',
  `${pub}enum LatheJSON {`,
  `    ${pub}static var decoder: JSONDecoder {`,
  '        let decoder = JSONDecoder()',
  '        decoder.dateDecodingStrategy = .custom { decoder in',
  '            let container = try decoder.singleValueContainer()',
  '            let text = try container.decode(String.self)',
  '            if let date = parseDate(text) { return date }',
  '            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected an RFC 3339 date-time, got \\(text)")',
  '        }',
  '        return decoder',
  '    }',
  '',
  `    ${pub}static var encoder: JSONEncoder {`,
  '        let encoder = JSONEncoder()',
  '        encoder.dateEncodingStrategy = .custom { date, encoder in',
  '            let formatter = ISO8601DateFormatter()',
  '            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]',
  '            var container = encoder.singleValueContainer()',
  '            try container.encode(formatter.string(from: date))',
  '        }',
  '        return encoder',
  '    }',
  '',
  `    ${pub}static func parseDate(_ text: String) -> Date? {`,
  '        let formatter = ISO8601DateFormatter()',
  '        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]',
  '        if let date = formatter.date(from: text) { return date }',
  '        formatter.formatOptions = [.withInternetDateTime]',
  '        return formatter.date(from: text)',
  '    }',
  '}',
]

/* ------------------------------------------------------------------ */
/* Kotlin                                                              */
/* ------------------------------------------------------------------ */

/** A Kotlin `package` name: dot-separated identifiers, no hard keywords. */
const KOTLIN_HARD_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is',
  'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof',
  'val', 'var', 'when', 'while',
])

export function isKotlinPackage(name: string): boolean {
  return name.split('.').every((seg) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(seg) && !KOTLIN_HARD_KEYWORDS.has(seg))
}

/** `in_progress` / `inProgress` -> `IN_PROGRESS`. */
function kotlinEntry(value: string): string {
  const parts = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toUpperCase())
  let out = parts.length === 0 ? 'EMPTY' : parts.join('_')
  if (/^[0-9]/.test(out)) out = `_${out}`

  return out
}

/** The Kotlin file: one `@Serializable` declaration per model. */
export function emitKotlinModels(doc: IrDocument, options: NativeModelsOptions = {}): GeneratedFile {
  const lowered = lowerModels(doc)
  const pkg = options.kotlinPackage ?? 'api'
  const out: string[] = kotlinHeader(doc, pkg, lowered)
  for (const d of lowered.decls) {
    if (d.kind === 'alias') out.push(...kotlinDoc(d.doc, ''), `typealias ${d.name} = ${kotlinType(d.type, '')}`, '')
    else if (d.kind === 'enum') out.push(...kotlinEnum(d))
    else if (d.kind === 'struct') out.push(...kotlinStruct(d))
    else out.push(...kotlinUnion(d, pkg))
  }
  out.push(
    '/**',
    ' * A `Json` configured for these models: unknown keys are ignored (as Swift\'s',
    ' * `Codable` does), so a server adding a field does not break decoding.',
    ' * `date-time` fields are ISO 8601 `String`s.',
    ' */',
    'val LatheJson: Json = Json { ignoreUnknownKeys = true }',
  )

  return { path: KOTLIN_MODELS_PATH, contents: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n` }
}

function kotlinHeader(doc: IrDocument, pkg: string, lowered: NativeModels): string[] {
  const hasUnions = lowered.decls.some((d) => d.kind === 'union')
  const out = [
    ...nativeBanner(doc.title, doc.version),
    '@file:Suppress("unused", "RedundantVisibilityModifier")',
    '',
    `package ${pkg}`,
    '',
    'import kotlinx.serialization.SerialName',
    'import kotlinx.serialization.Serializable',
    'import kotlinx.serialization.json.Json',
  ]
  if (lowered.usesJson || hasUnions) out.push('import kotlinx.serialization.json.JsonElement')
  if (hasUnions) {
    out.push(
      'import kotlinx.serialization.KSerializer',
      'import kotlinx.serialization.SerializationException',
      'import kotlinx.serialization.descriptors.SerialDescriptor',
      'import kotlinx.serialization.encoding.Decoder',
      'import kotlinx.serialization.encoding.Encoder',
      'import kotlinx.serialization.json.JsonDecoder',
      'import kotlinx.serialization.json.JsonEncoder',
      'import kotlinx.serialization.json.JsonObject',
      'import kotlinx.serialization.json.JsonPrimitive',
      'import kotlinx.serialization.json.decodeFromJsonElement',
      'import kotlinx.serialization.json.encodeToJsonElement',
    )
  }
  out.push('')

  return out
}

/**
 * A type in Kotlin. `qualifier` (`<package>.`) prefixes model names: inside a
 * sealed interface a case class may share a model's name and would shadow it.
 */
function kotlinType(t: NativeType, qualifier: string): string {
  switch (t.k) {
    case 'string':
    case 'date':
      return 'String'
    case 'int':
    case 'int64':
      return 'Long'
    case 'double':
      return 'Double'
    case 'bool':
      return 'Boolean'
    case 'json':
      return 'JsonElement'
    case 'named':
      return `${qualifier}${t.name}`
    case 'array':
      return `List<${kotlinType(t.of, qualifier)}>`
    case 'map':
      return `Map<String, ${kotlinType(t.of, qualifier)}>`
    case 'optional':
      return `${kotlinType(t.of, qualifier)}?`
  }
}

function kotlinEnum(d: Extract<NativeDecl, { kind: 'enum' }>): string[] {
  if (d.raw === 'int') {
    // kotlinx.serialization writes an enum as its NAME; an integer-valued
    // enum has no faithful mapping, so it stays the integer it is.
    const text = [d.doc, `One of: ${d.values.join(', ')}.`].filter(Boolean).join('\n\n')
    return [...kotlinDoc(text, ''), `typealias ${d.name} = Long`, '']
  }
  const entries = uniqueIdents(d.values.map(String), kotlinEntry)
  return [
    ...kotlinDoc(d.doc, ''),
    '@Serializable',
    `enum class ${d.name} {`,
    ...d.values.map((v, i) => `    @SerialName(${quoted(String(v), 'kotlin')}) ${entries[i]},`),
    '}',
    '',
  ]
}

function kotlinStruct(d: Extract<NativeDecl, { kind: 'struct' }>): string[] {
  const text = [d.doc, d.droppedAdditional ? 'This object also allows additional properties; only the declared ones are modelled.' : undefined]
  const out = [...kotlinDoc(text.filter(Boolean).join('\n\n') || undefined, ''), '@Serializable']
  // A data class needs at least one constructor parameter.
  if (d.fields.length === 0) return [...out, `class ${d.name}`, '']
  const props = uniqueIdents(d.fields.map((f) => f.wire), (w) => ident(w))
  out.push(`data class ${d.name}(`)
  d.fields.forEach((f, i) => {
    const name = props[i] as string
    const serial = f.wire === name ? '' : `@SerialName(${quoted(f.wire, 'kotlin')}) `
    const value = `${kotlinType(declaredType(f), '')}${f.required ? '' : ' = null'}`
    out.push(...kotlinDoc(f.doc, '    '), `    ${serial}val ${kotlinIdent(name)}: ${value},`)
  })
  out.push(')', '')

  return out
}

function kotlinUnion(d: Extract<NativeDecl, { kind: 'union' }>, pkg: string): string[] {
  const text = [d.doc, d.untaggedReason ? `Decoded untagged (the first member that decodes wins): ${d.untaggedReason}.` : undefined]
  const cases = uniqueIdents(d.variants.map((v) => v.label), (l) => pascal(l))
  const out = [
    ...kotlinDoc(text.filter(Boolean).join('\n\n') || undefined, ''),
    `@Serializable(with = ${d.serializer}::class)`,
    `sealed interface ${d.name} {`,
    ...d.variants.map((v, i) => `    data class ${cases[i]}(val value: ${kotlinType(v.type, `${pkg}.`)}) : ${d.name}`),
    '}',
    '',
    `object ${d.serializer} : KSerializer<${d.name}> {`,
    '    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor',
    '',
    `    override fun deserialize(decoder: Decoder): ${d.name} {`,
    `        val input = decoder as? JsonDecoder ?: throw SerializationException(${quoted(`${d.name} can only be decoded from JSON`, 'kotlin')})`,
    '        val element = input.decodeJsonElement()',
    ...(d.discriminator !== undefined ? kotlinTaggedDecode(d, cases, d.discriminator) : kotlinUntaggedDecode(d, cases)),
    '    }',
    '',
    `    override fun serialize(encoder: Encoder, value: ${d.name}) {`,
    `        val output = encoder as? JsonEncoder ?: throw SerializationException(${quoted(`${d.name} can only be encoded to JSON`, 'kotlin')})`,
    '        val element = when (value) {',
    ...d.variants.map((v, i) => `            is ${d.name}.${cases[i]} -> output.json.encodeToJsonElement<${kotlinType(v.type, '')}>(value.value)`),
    '        }',
    '        output.encodeJsonElement(element)',
    '    }',
    '}',
    '',
  ]

  return out
}

function kotlinTaggedDecode(d: Extract<NativeDecl, { kind: 'union' }>, cases: string[], key: string): string[] {
  return [
    `        val tag = ((element as? JsonObject)?.get(${quoted(key, 'kotlin')}) as? JsonPrimitive)?.takeIf { it.isString }?.content`,
    '        return when (tag) {',
    ...d.variants.map(
      (v, i) =>
        `            ${(v.tags ?? []).map((t) => quoted(t, 'kotlin')).join(', ')} -> ${d.name}.${cases[i]}(input.json.decodeFromJsonElement<${kotlinType(v.type, '')}>(element))`,
    ),
    `            else -> throw SerializationException("Unknown ${quoted(key, 'kotlin').slice(1, -1)} \${tag} for ${d.name}")`,
    '        }',
  ]
}

function kotlinUntaggedDecode(d: Extract<NativeDecl, { kind: 'union' }>, cases: string[]): string[] {
  // `Exception`, not `SerializationException`: kotlinx's tree decoder can throw
  // an IndexOutOfBoundsException for a member of the wrong JSON shape.
  return [
    ...d.variants.map(
      (v, i) =>
        `        try { return ${d.name}.${cases[i]}(input.json.decodeFromJsonElement<${kotlinType(v.type, '')}>(element)) } catch (e: Exception) { }`,
    ),
    `        throw SerializationException(${quoted(`No member of ${d.name} matches the value`, 'kotlin')})`,
  ]
}

/** `ident` already suffixes every Kotlin hard keyword; this is the guard if that list ever shrinks. */
function kotlinIdent(name: string): string {
  return KOTLIN_HARD_KEYWORDS.has(name) ? `\`${name}\`` : name
}
