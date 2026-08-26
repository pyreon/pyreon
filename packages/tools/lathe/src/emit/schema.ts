/**
 * Type and schema emission.
 *
 * Two renderings of the same IR type: a TypeScript type annotation, and a
 * `@pyreon/validate` `s.*` expression. They are generated from one walk so
 * they cannot drift — the failure mode of writing them separately is a
 * declared type that the runtime schema does not actually enforce.
 */

import type { IrDocument, IrField, IrType } from '../core/ir'
import { propKey, typeIdent } from '../core/naming'
import { q, relativeSpecifier, SourceFile } from './writer'

export const SCHEMA_FILE = 'schemas.ts'

/** Render an IR type as a TypeScript type expression. */
export function tsType(type: IrType, depth = 0, native = false): string {
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
 * Render an IR type as an `s.*` expression.
 *
 * `native` narrows the output to the subset PMTC lowers. The difference is not
 * cosmetic: on the native path an enum becomes `s.string()` and the constraint
 * is LOST there, so callers must report that rather than let a reader assume
 * the two targets validate identically.
 */
export function schemaExpr(type: IrType, opts: { native: boolean }, depth = 0): string {
  switch (type.kind) {
    case 'string': {
      if (type.enum && !opts.native) return `s.enum([${type.enum.map((v) => q(v)).join(', ')}])`
      if (type.enum && opts.native) return 's.string()'
      switch (type.format) {
        case 'email':
          return 's.string().email()'
        case 'uri':
          return 's.string().url()'
        case 'uuid':
          return 's.string().uuid()'
        // `date` / `date-time` stay strings deliberately: `s.date()` does not
        // lower, and a schema that parses to a Date on web and a String on
        // native is a divergence no consumer can see coming.
        default:
          return 's.string()'
      }
    }
    case 'number':
      return type.integer ? 's.number().int()' : 's.number()'
    case 'boolean':
      return 's.boolean()'
    case 'null':
      return opts.native ? 's.string()' : 's.null()'
    case 'unknown':
      return opts.native ? 's.string()' : 's.unknown()'
    case 'ref':
      return type.name
    case 'array':
      return `s.array(${schemaExpr(type.items, opts, depth + 1)})`
    case 'union': {
      if (opts.native) return 's.string()'
      const inner = type.options.map((o) => schemaExpr(o, opts, depth + 1)).join(', ')
      return type.discriminator
        ? `s.discriminatedUnion(${q(type.discriminator)}, [${inner}])`
        : `s.union([${inner}])`
    }
    case 'object': {
      if (type.fields.length === 0) {
        return type.additional && !opts.native
          ? `s.record(s.string(), ${schemaExpr(type.additional, opts, depth + 1)})`
          : 's.object({})'
      }
      const pad = '  '.repeat(depth + 1)
      const close = '  '.repeat(depth)
      const body = type.fields.map((f) => `${pad}${propKey(f.name)}: ${fieldSchema(f, opts, depth + 1)},`).join('\n')
      return `s.object({\n${body}\n${close}})`
    }
  }
}

function fieldSchema(field: IrField, opts: { native: boolean }, depth: number): string {
  let expr = schemaExpr(field.type, opts, depth)
  // Constraints only attach to the kinds that carry them.
  if (field.type.kind === 'string') {
    if (typeof field.min === 'number') expr += `.min(${field.min})`
    if (typeof field.max === 'number') expr += `.max(${field.max})`
    if (field.pattern && portableRegex(field.pattern)) expr += `.regex(/${field.pattern}/)`
  } else if (field.type.kind === 'number') {
    if (typeof field.min === 'number') expr += `.min(${field.min})`
    if (typeof field.max === 'number') expr += `.max(${field.max})`
  }
  if (field.nullable) expr += '.nullable()'
  if (!field.required) expr += '.optional()'
  return expr
}

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
  if (pattern.includes('/')) return false
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

/** Emit `schemas.ts` — one schema + one type per model. */
export function emitSchemas(doc: IrDocument, opts: { native: boolean }): SourceFile {
  const f = new SourceFile(SCHEMA_FILE)
  if (doc.models.length === 0) return f
  f.import('@pyreon/validate', 's')
  f.importType('@pyreon/validate', 'Infer')

  for (const model of doc.models) {
    f.line()
    f.doc(model.doc)
    // The schema is a top-level `const` bound to a plain `s.object({ … })`
    // literal, which is exactly the shape PMTC's recognizer requires. Wrapping
    // it in anything — a helper call, a `satisfies`, a spread — silently drops
    // it off the native path.
    f.line(`export const ${model.name} = ${schemaExpr(model.type, opts)}`)
    f.line(`export type ${model.name} = Infer<typeof ${model.name}>`)
  }
  return f
}

/** Emit `types.ts` — plain TS types, for consumers that want no runtime. */
export function emitTypes(doc: IrDocument): SourceFile {
  const f = new SourceFile('types.ts')
  for (const model of doc.models) {
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
  return undefined
}

/** A readable TS name for an operation's response. */
export function responseTypeName(type: IrType | undefined): string {
  if (!type) return 'void'
  return tsType(type)
}

export { typeIdent }
