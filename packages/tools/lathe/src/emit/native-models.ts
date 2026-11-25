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
import { camel, pascal } from '../core/naming'
import { kotlinEntry, nativeIdent, swiftCaseIdent } from './native-identifiers'
import { SWIFT_JSON_VALUE, SWIFT_LATHE_JSON } from './native-swift-support'
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
 * Types an iOS / Android app module routinely names. The generated file lives
 * IN that module, so a model called `Data`, `URL`, `View` or `Result` would
 * shadow Foundation's / SwiftUI's / Kotlin's own across the whole app, not
 * just in this file. Renamed like a printer name (`<Name>Model`).
 */
const PLATFORM_TYPES = [
  'Any', 'AnyObject', 'Array', 'Bool', 'Boolean', 'Button', 'Byte', 'Calendar', 'Char', 'Character',
  'Collection', 'Color', 'Comparable', 'Data', 'Date', 'Decimal', 'Dictionary', 'Double', 'Error', 'Float',
  'Image', 'Int', 'Int64', 'Iterable', 'List', 'Locale', 'Long', 'Map', 'Never', 'Nothing', 'Notification',
  'Number', 'Object', 'Optional', 'Pair', 'Protocol', 'Result', 'Self', 'Sequence', 'Set', 'Short', 'String',
  'Task', 'Text', 'Throwable', 'TimeZone', 'Triple', 'Type', 'URL', 'UUID', 'Unit', 'View', 'Void',
]

let reservedCache: ReadonlySet<string> | undefined

/**
 * Every name a model must not take: each type name the printers THEMSELVES
 * write (derived, see {@link printerTypeNames}) plus {@link PLATFORM_TYPES}.
 * Constant for the process, so computed once.
 */
export function nativeReserved(): ReadonlySet<string> {
  reservedCache ??= new Set([...printerTypeNames(), ...PLATFORM_TYPES])
  return reservedCache
}

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
export function lowerModels(ir: IrDocument, reserved: ReadonlySet<string> = nativeReserved()): NativeModels {
  const lowerer = new Lowerer(ir, reserved)
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
  private readonly namer: Namer
  /** Every model keeps its IR name unless that name is one the printers use. */
  private readonly modelName = new Map<string, string>()
  private readonly models: ReadonlyMap<string, IrModel>

  constructor(ir: IrDocument, reserved: ReadonlySet<string>) {
    this.namer = new Namer(reserved)
    for (const m of ir.models) {
      this.modelName.set(m.name, this.namer.claim(reserved.has(m.name) ? `${m.name}Model` : m.name))
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

  /**
   * How a union is dispatched. A discriminator whose members PIN their tag
   * (an enum / `const` property -- what `t.discriminator` means after the
   * input layer's check) uses those values. One whose tag property is a plain
   * string uses OpenAPI's mapping rule instead: the `mapping` keys naming a
   * member, else its component name (`t.declared`). Never shape-guessing: a
   * `Dog` and a `Cat` with the same fields would otherwise decode as whichever
   * comes first.
   */
  private tagging(t: IrUnion): { key?: string | undefined; tags?: string[][] | string | undefined } {
    if (t.discriminator !== undefined) return { key: t.discriminator, tags: this.tagsOf(t.options, t.discriminator) }
    if (!t.declared) return {}
    const all = t.declared.tags.flat()
    if (t.declared.tags.length !== t.options.length || t.declared.tags.some((v) => v.length === 0)) {
      return { key: t.declared.property, tags: 'a member has no tag value' }
    }
    if (new Set(all).size !== all.length) return { key: t.declared.property, tags: 'two members share a discriminator value' }

    return { key: t.declared.property, tags: t.declared.tags.map((v) => [...v]) }
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
    const { key, tags } = this.tagging(t)
    if (typeof tags === 'string') decl.untaggedReason = `discriminator \`${key}\`: ${tags}`
    else if (tags) decl.discriminator = key
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
  return { path: SWIFT_MODELS_PATH, contents: printSwift(doc, lowerModels(doc), options) }
}

function printSwift(doc: Pick<IrDocument, 'title' | 'version'>, lowered: NativeModels, options: NativeModelsOptions): string {
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

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
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
    d.raw === 'string' ? (v) => swiftCaseIdent(v) : (v) => swiftCaseIdent(`value ${v.replace('-', 'minus ')}`),
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
  const props = uniqueIdents(d.fields.map((f) => f.wire), nativeIdent)
  const types = d.fields.map((f) => swiftType(declaredType(f)))
  out.push(`${pub}${d.recursive ? 'final class' : 'struct'} ${d.name}: Codable {`)
  d.fields.forEach((f, i) => out.push(...swiftDoc(f.doc, '    '), `    ${pub}var ${props[i]}: ${types[i]}`))
  if (d.fields.length > 0) out.push('')
  const params = d.fields.map((f, i) => `${props[i]}: ${types[i]}${f.required ? '' : ' = nil'}`)
  out.push(`    ${pub}init(${params.join(', ')}) {`, ...props.map((p) => `        self.${p} = ${p}`), '    }')
  // A REQUIRED nullable field must be written as `null` and must be present
  // to decode. Synthesized Codable treats every Optional as omittable (it
  // uses `encodeIfPresent` / `decodeIfPresent`), so such a struct spells both
  // out -- which is what Kotlin's `T?` with no default already does.
  const explicit = d.fields.some((f) => f.required && f.type.k === 'optional')
  if (explicit || d.fields.some((f, i) => f.wire !== props[i])) {
    out.push('', '    enum CodingKeys: String, CodingKey {')
    d.fields.forEach((f, i) => {
      out.push(f.wire === props[i] ? `        case ${props[i]}` : `        case ${props[i]} = ${quoted(f.wire, 'swift')}`)
    })
    out.push('    }')
  }
  if (explicit) out.push(...swiftExplicitCodable(d, props, pub))
  out.push('}', '')

  return out
}

/** `init(from:)` + `encode(to:)` that keep a required nullable key on the wire. */
function swiftExplicitCodable(d: Extract<NativeDecl, { kind: 'struct' }>, props: string[], pub: string): string[] {
  const out = ['', `    ${pub}${d.recursive ? 'required ' : ''}init(from decoder: Decoder) throws {`]
  out.push('        let container = try decoder.container(keyedBy: CodingKeys.self)')
  d.fields.forEach((f, i) => {
    const p = props[i] as string
    if (f.required) out.push(`        self.${p} = try container.decode(${swiftType(f.type)}.self, forKey: .${p})`)
    else out.push(`        self.${p} = try container.decodeIfPresent(${swiftType(innerType(f.type))}.self, forKey: .${p})`)
  })
  out.push('    }', '', `    ${pub}func encode(to encoder: Encoder) throws {`, '        var container = encoder.container(keyedBy: CodingKeys.self)')
  d.fields.forEach((f, i) => {
    const p = props[i] as string
    out.push(`        try container.${f.required ? 'encode' : 'encodeIfPresent'}(${p}, forKey: .${p})`)
  })
  out.push('    }')

  return out
}

function innerType(t: NativeType): NativeType {
  return t.k === 'optional' ? t.of : t
}

function swiftUnion(d: Extract<NativeDecl, { kind: 'union' }>, pub: string): string[] {
  const out: string[] = []
  if (d.untaggedReason) out.push(`// lathe: decoded untagged (first member that decodes wins) — ${safeLineComment(d.untaggedReason)}.`)
  const cases = uniqueIdents(d.variants.map((v) => v.label), (l) => swiftCaseIdent(camel(l)))
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

/* ------------------------------------------------------------------ */
/* Kotlin                                                              */
/* ------------------------------------------------------------------ */

/** The Kotlin file: one `@Serializable` declaration per model. */
export function emitKotlinModels(doc: IrDocument, options: NativeModelsOptions = {}): GeneratedFile {
  return { path: KOTLIN_MODELS_PATH, contents: printKotlin(doc, lowerModels(doc), options) }
}

function printKotlin(doc: Pick<IrDocument, 'title' | 'version'>, lowered: NativeModels, options: NativeModelsOptions): string {
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

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

function kotlinHeader(doc: Pick<IrDocument, 'title' | 'version'>, pkg: string, lowered: NativeModels): string[] {
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
  const props = uniqueIdents(d.fields.map((f) => f.wire), nativeIdent)
  out.push(`data class ${d.name}(`)
  d.fields.forEach((f, i) => {
    const name = props[i] as string
    const serial = f.wire === name ? '' : `@SerialName(${quoted(f.wire, 'kotlin')}) `
    const value = `${kotlinType(declaredType(f), '')}${f.required ? '' : ' = null'}`
    out.push(...kotlinDoc(f.doc, '    '), `    ${serial}val ${name}: ${value},`)
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

/* ------------------------------------------------------------------ */
/* Reserved names, derived from the printers                           */
/* ------------------------------------------------------------------ */

/** Probe model names: they must not look like anything a printer writes. */
const PROBE = 'Zqx'

const PROBE_STRING: IrType = { kind: 'string' }

function probeTagged(tag: string): IrType {
  return { kind: 'object', fields: [{ name: 't', type: { kind: 'enum', values: [tag] }, required: true }] }
}

/**
 * A document that drives EVERY printer branch: a struct with CodingKeys, a
 * required nullable field (explicit Codable), every scalar, a date, free
 * JSON, a map, string and integer enums, a recursive class, an empty object,
 * a tagged and an untagged union with every primitive member, and an alias.
 * `native-models.test.ts` locks that the derived set covers every type name
 * the printers emit for its own fixture, so a printer branch this probe
 * misses fails a test rather than shipping an unreserved name.
 */
const PROBE_DOC: IrDocument = {
  title: 'probe',
  version: '0',
  baseUrl: '',
  operations: [],
  notes: [],
  models: [
    {
      name: `${PROBE}S`,
      type: {
        kind: 'object',
        additional: PROBE_STRING,
        fields: [
          { name: 'snake_key', type: { kind: 'nullable', inner: PROBE_STRING }, required: true },
          { name: 'o', type: { kind: 'number', integer: false }, required: false },
          { name: 'i', type: { kind: 'number', integer: true }, required: true },
          { name: 'l', type: { kind: 'bigint' }, required: true },
          { name: 'b', type: { kind: 'boolean' }, required: true },
          { name: 'd', type: { kind: 'string', format: 'date-time' }, required: true },
          { name: 'j', type: { kind: 'unknown', reason: 'probe' }, required: true },
          { name: 'm', type: { kind: 'object', fields: [], additional: PROBE_STRING }, required: true },
          { name: 'a', type: { kind: 'array', items: PROBE_STRING }, required: true },
          { name: 'e', type: { kind: 'enum', values: ['zqxa', 'zqxb'] }, required: true },
          { name: 'n', type: { kind: 'enum', values: [1, 2] }, required: true },
          { name: 'r', type: { kind: 'ref', name: `${PROBE}S` }, required: false },
        ],
      },
    },
    { name: `${PROBE}E`, type: { kind: 'object', fields: [] } },
    { name: `${PROBE}A`, type: probeTagged('zqxa') },
    { name: `${PROBE}B`, type: probeTagged('zqxb') },
    {
      name: `${PROBE}T`,
      type: {
        kind: 'union',
        discriminator: 't',
        options: [
          { kind: 'ref', name: `${PROBE}A` },
          { kind: 'ref', name: `${PROBE}B` },
        ],
      },
    },
    {
      name: `${PROBE}U`,
      type: {
        kind: 'union',
        options: [
          PROBE_STRING,
          { kind: 'number', integer: true },
          { kind: 'number', integer: false },
          { kind: 'boolean' },
          { kind: 'bigint' },
          { kind: 'string', format: 'date-time' },
          { kind: 'unknown', reason: 'probe' },
          { kind: 'array', items: PROBE_STRING },
          { kind: 'object', fields: [], additional: PROBE_STRING },
          { kind: 'nullable', inner: { kind: 'ref', name: `${PROBE}A` } },
        ],
      },
    },
    { name: `${PROBE}L`, type: { kind: 'array', items: PROBE_STRING } },
  ],
}

/**
 * Every capitalized identifier in `source` outside comments and string
 * literals -- the TYPE names a file writes (models are PascalCase, so only
 * those can collide).
 */
export function typeNamesIn(source: string): Set<string> {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')

  return new Set(code.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? [])
}

/**
 * The type names the printers write that are not a model's: each one a model
 * would shadow (`List`, `Date`, `Hashable`, `CaseIterable`, `TagKey`,
 * `CodingKeys`, Kotlin's `Suppress` from `@file:Suppress`, …). Derived by
 * printing {@link PROBE_DOC} -- a hand-kept list missed `Hashable` and
 * `Suppress` -- minus what the probe itself declared and the Kotlin enum
 * entries / case classes its names produce.
 */
function printerTypeNames(): Set<string> {
  const lowered = lowerModels(PROBE_DOC, new Set())
  const declared = new Set<string>()
  for (const d of lowered.decls) {
    declared.add(d.name)
    if (d.kind === 'union') declared.add(d.serializer)
  }
  const names = new Set<string>()
  for (const text of [printSwift(PROBE_DOC, lowered, {}), printKotlin(PROBE_DOC, lowered, {})]) {
    for (const n of typeNamesIn(text)) {
      if (!declared.has(n) && !n.toLowerCase().startsWith(PROBE.toLowerCase())) names.add(n)
    }
  }

  return names
}
