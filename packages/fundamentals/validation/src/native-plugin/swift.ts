// The Swift spelling of a lowered schema: a Codable struct (an enum for a discriminated union) with
// `parse` / `safeParse`, per-field constraint checks, and the `validateField` a native form delegates to.
// Plugin-owned: the compiler core only calls `emitSwiftSchemaItem` through the item emitter.

import { localBase, swiftCodingKeysLines, swiftIdent, swiftStr } from '@pyreon/native-compiler/plugin-api'
import type { ZodFieldConstraints, ZodFieldType, ZodSchemaDefnIR } from './ir'
import { HTTP_URL_PATTERN, URI_PATTERN } from './url-rule'

/**
 * Gap 4 follow-up — `@pyreon/validation` Zod-schema v1 emit (Swift).
 * Produces a Codable struct + module-scope const. Apps validate at
 * JSON-decode time via Codable; v1 doesn't yet emit runtime .parse()
 * methods (v2 follow-up).
 *
 *   struct PyreonZodSchema_userSchema: Codable {
 *       var name: String = ""
 *       var age: Int = 0
 *       var active: Bool = false
 *   }
 *   let userSchema = PyreonZodSchema_userSchema()
 */
function swiftFieldType(t: ZodFieldType): string {
  if (typeof t === 'string') {
    return t === 'string' ? 'String' : t === 'number' ? 'Int' : 'Bool'
  }
  if (t.kind === 'object') {
    // Gap 4 v3.2 — nested object reference. Emit the synthesized struct name.
    return `PyreonZodSchema_${t.schemaName}`
  }
  // v2.2 array — element may now be a nested object (v3.2).
  let elem: string
  if (typeof t.element === 'string') {
    elem = t.element === 'string' ? 'String' : t.element === 'number' ? 'Int' : 'Bool'
  } else {
    elem = `PyreonZodSchema_${t.element.schemaName}`
  }
  return `[${elem}]`
}

function swiftFieldInitial(t: ZodFieldType): string {
  if (typeof t === 'string') {
    return t === 'string' ? '""' : t === 'boolean' ? 'false' : '0'
  }
  if (t.kind === 'object') {
    // Initialize nested object with its own default constructor
    return `PyreonZodSchema_${t.schemaName}()`
  }
  return '[]'
}

/**
 * Gap 4 v2.1 — emit Swift constraint-check guards for a scalar value.
 * Used at three call sites: required scalar field, optional scalar
 * field (inside the present-checked block), and array-element loop
 * body (with `ruleSuffix: ' (element)'` for clearer error messages).
 */
function emitSwiftScalarConstraints(
  lines: string[],
  targetName: string,
  t: ZodFieldType,
  constraints: ZodFieldConstraints | undefined,
  fieldName: string,
  indent: number,
  ruleSuffix = '',
): void {
  if (!constraints) return
  // Only scalar string/number constraints apply at the scalar-emit level.
  const isString = t === 'string'
  const isNumber = t === 'number'
  if (!isString && !isNumber) return
  const ind = ' '.repeat(indent)
  const innerInd = ' '.repeat(indent + 4)
  const c = constraints
  if (isString) {
    if (c.min !== undefined) {
      // `.utf16.count`, NOT `.count`. Swift's String.count counts GRAPHEME
      // CLUSTERS; JS `.length` and Kotlin `.length` both count UTF-16 code
      // units. The web is the reference implementation here — @pyreon/validate
      // checks `value.length` — so `.count` made iOS REJECT strings web and
      // Android accept: `min(2)` against "👍" is 2 units (pass) but 1 grapheme
      // (fail). A validator that disagrees per platform is a data-integrity
      // bug, not a rounding difference.
      lines.push(`${ind}if ${targetName}.utf16.count < ${c.min} {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${swiftStr(fieldName)}, rule: "min length ${c.min}${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.max !== undefined) {
      lines.push(`${ind}if ${targetName}.utf16.count > ${c.max} {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${swiftStr(fieldName)}, rule: "max length ${c.max}${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.email) {
      lines.push(
        `${ind}if ${targetName}.range(of: #"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$"#, options: [.regularExpression, .caseInsensitive]) == nil {`,
      )
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${swiftStr(fieldName)}, rule: "email${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.url) {
      // The AUTHORING library's rule (see `UrlRule`), not one rule for all.
      const rule = c.url
      if (rule.kind === 'scheme') {
        // zod: `URL(string:)` is a PARSER, not a validator — it accepts
        // "not a url", "x.com" and "/relative", all of which zod rejects.
        // Requiring a scheme reproduces zod's rule (an absolute URL), which
        // still accepts "mailto:a@b.co" and "ftp://x.com" as zod does.
        lines.push(`${ind}if URL(string: ${targetName})?.scheme == nil {`)
      } else if (rule.kind === 'http') {
        // `@pyreon/validate`'s default: http(s) with a host, exactly.
        lines.push(
          `${ind}if ${targetName}.range(of: #"${HTTP_URL_PATTERN}"#, options: [.regularExpression]) == nil {`,
        )
      } else {
        // `.url({ protocol })`: an absolute URI, then the scheme (the text
        // before the first colon) partially matched, as `RegExp.test()` is.
        const opts = rule.ignoreCase ? '[.regularExpression, .caseInsensitive]' : '[.regularExpression]'
        lines.push(
          `${ind}if ${targetName}.range(of: #"${URI_PATTERN}"#, options: [.regularExpression]) == nil || String(${targetName}.prefix(while: { $0 != ":" })).range(of: #"${rule.source}"#, options: ${opts}) == nil {`,
        )
      }
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${swiftStr(fieldName)}, rule: "url${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.regex) {
      // Partial match, which is what `RegExp.test()` does on the web — an
      // anchored pattern still anchors. Raw string so backslashes survive.
      const opts = c.regex.ignoreCase
        ? '[.regularExpression, .caseInsensitive]'
        : '[.regularExpression]'
      lines.push(
        `${ind}if ${targetName}.range(of: #"${c.regex.source}"#, options: ${opts}) == nil {`,
      )
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${swiftStr(fieldName)}, rule: "regex${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.uuid) {
      lines.push(`${ind}if UUID(uuidString: ${targetName}) == nil {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${swiftStr(fieldName)}, rule: "uuid${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
  } else if (isNumber) {
    if (c.min !== undefined) {
      lines.push(`${ind}if ${targetName} < ${c.min} {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${swiftStr(fieldName)}, rule: "min ${c.min}${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
    if (c.max !== undefined) {
      lines.push(`${ind}if ${targetName} > ${c.max} {`)
      lines.push(
        `${innerInd}throw PyreonSchemaError.constraintViolation(field: ${swiftStr(fieldName)}, rule: "max ${c.max}${ruleSuffix}")`,
      )
      lines.push(`${ind}}`)
    }
  }
}

/**
 * Gap 4 v3 — emit a `for elem in <field>Val { ... }` loop that
 * applies the array's `elementConstraints` to each element. Only
 * called for array field types; no-op for scalars.
 */
function emitSwiftArrayElementConstraints(
  lines: string[],
  targetName: string,
  t: ZodFieldType,
  fieldName: string,
  indent: number,
): void {
  if (typeof t === 'string') return
  if (t.kind !== 'array') return
  // v3.2 — object-element arrays don't have primitive elementConstraints;
  // their per-element validation flows through the nested schema's parse().
  if (typeof t.element !== 'string') return
  if (!t.elementConstraints) return
  if (Object.keys(t.elementConstraints).length === 0) return
  const ind = ' '.repeat(indent)
  const elementVar = `${fieldName}Element`
  lines.push(`${ind}for ${elementVar} in ${targetName} {`)
  emitSwiftScalarConstraints(
    lines,
    elementVar,
    t.element,
    t.elementConstraints,
    fieldName,
    indent + 4,
    ' (element)',
  )
  lines.push(`${ind}}`)
}

/**
 * Gap 4 v3.3 — emit a discriminated union as a Swift enum with
 * associated values. Each variant case wraps its aux struct.
 */
function emitSwiftDiscriminatedUnion(zs: ZodSchemaDefnIR): string {
  const d = zs.discriminator!
  const lines: string[] = []
  const typeName = `PyreonZodSchema_${zs.bindingName}`
  lines.push(`enum ${typeName} {`)
  for (const v of d.variants) {
    lines.push(`    case ${swiftIdent(camelCase(v.caseName))}(PyreonZodSchema_${v.schemaName})`)
  }
  lines.push(``)
  lines.push(`    static func parse(_ input: [String: Any]) throws -> Self {`)
  lines.push(
    `        guard let discr = input[${swiftStr(d.field)}] as? String else {`,
  )
  lines.push(
    `            throw PyreonSchemaError.missingOrWrongType(field: ${swiftStr(d.field)}, expected: "String")`,
  )
  lines.push(`        }`)
  lines.push(`        switch discr {`)
  for (const v of d.variants) {
    lines.push(`        case ${swiftStr(v.literal)}:`)
    lines.push(
      `            return .${swiftIdent(camelCase(v.caseName))}(try PyreonZodSchema_${v.schemaName}.parse(input))`,
    )
  }
  lines.push(`        default:`)
  lines.push(
    `            throw PyreonSchemaError.constraintViolation(field: ${swiftStr(d.field)}, rule: "unknown discriminator value")`,
  )
  lines.push(`        }`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(
    `    static func safeParse(_ input: [String: Any]) -> Result<Self, PyreonSchemaError> {`,
  )
  lines.push(`        do { return .success(try parse(input)) }`)
  lines.push(`        catch let e as PyreonSchemaError { return .failure(e) }`)
  lines.push(`        catch { return .failure(.missingOrWrongType(field: "?", expected: "?")) }`)
  lines.push(`    }`)
  lines.push(`}`)
  return lines.join('\n') + '\n'
}

/**
 * Gap 4 v3.3 — lowercase the first character of an identifier.
 * Used to convert PascalCased variant caseName ("Cat") to a Swift
 * enum case ("cat").
 */
function camelCase(s: string): string {
  if (s.length === 0) return s
  return s[0]!.toLowerCase() + s.slice(1)
}

export function emitSwiftZodSchema(zs: ZodSchemaDefnIR): string {
  // Gap 4 v3.3 — discriminated union: emit as a Swift enum with
  // associated values. Each variant case wraps the variant's struct
  // and parse() routes via a switch on the discriminator value.
  if (zs.discriminator) return emitSwiftDiscriminatedUnion(zs)
  const lines: string[] = []
  lines.push(`struct PyreonZodSchema_${zs.bindingName}: Codable {`)
  for (const f of zs.fields) {
    const t = swiftFieldType(f.type)
    if (f.optional) {
      lines.push(`    var ${swiftIdent(f.name)}: ${t}? = nil`)
    } else {
      const initial = swiftFieldInitial(f.type)
      lines.push(`    var ${swiftIdent(f.name)}: ${t} = ${initial}`)
    }
  }
  lines.push(...swiftCodingKeysLines(zs.fields.map((f) => f.name), '    '))
  lines.push(``)
  // Gap 4 v2 — runtime .parse() / .safeParse() methods. Take a
  // `[String: Any]` (decoded JSON map), type-check each field,
  // return the validated struct or throw PyreonSchemaError.
  lines.push(`    static func parse(_ input: [String: Any]) throws -> Self {`)
  lines.push(`        var result = Self()`)
  for (const f of zs.fields) {
    const t = swiftFieldType(f.type)
    // Gap 4 v3.2 — nested object field: route via the nested schema's
    // own parse() method.
    if (typeof f.type !== 'string' && f.type.kind === 'object') {
      const nestedType = `PyreonZodSchema_${f.type.schemaName}`
      if (f.optional) {
        lines.push(`        if let raw = input[${swiftStr(f.name)}] {`)
        lines.push(
          `            guard let ${localBase(f.name)}Raw = raw as? [String: Any] else {`,
        )
        lines.push(
          `                throw PyreonSchemaError.missingOrWrongType(field: ${swiftStr(f.name)}, expected: ${swiftStr(nestedType)})`,
        )
        lines.push(`            }`)
        lines.push(
          `            result.${swiftIdent(f.name)} = try ${nestedType}.parse(${localBase(f.name)}Raw)`,
        )
        lines.push(`        }`)
      } else {
        lines.push(
          `        guard let ${localBase(f.name)}Raw = input[${swiftStr(f.name)}] as? [String: Any] else {`,
        )
        lines.push(
          `            throw PyreonSchemaError.missingOrWrongType(field: ${swiftStr(f.name)}, expected: ${swiftStr(nestedType)})`,
        )
        lines.push(`        }`)
        lines.push(
          `        result.${swiftIdent(f.name)} = try ${nestedType}.parse(${localBase(f.name)}Raw)`,
        )
      }
      continue
    }
    // Gap 4 v3.2 — array of objects field: route via per-element parse().
    if (
      typeof f.type !== 'string' &&
      f.type.kind === 'array' &&
      typeof f.type.element !== 'string' &&
      f.type.element.kind === 'object'
    ) {
      const nestedType = `PyreonZodSchema_${f.type.element.schemaName}`
      const arrayType = `[${nestedType}]`
      if (f.optional) {
        lines.push(`        if let raw = input[${swiftStr(f.name)}] {`)
        lines.push(
          `            guard let ${localBase(f.name)}Raw = raw as? [[String: Any]] else {`,
        )
        lines.push(
          `                throw PyreonSchemaError.missingOrWrongType(field: ${swiftStr(f.name)}, expected: ${swiftStr(arrayType)})`,
        )
        lines.push(`            }`)
        lines.push(
          `            result.${swiftIdent(f.name)} = try ${localBase(f.name)}Raw.map { try ${nestedType}.parse($0) }`,
        )
        lines.push(`        }`)
      } else {
        lines.push(
          `        guard let ${localBase(f.name)}Raw = input[${swiftStr(f.name)}] as? [[String: Any]] else {`,
        )
        lines.push(
          `            throw PyreonSchemaError.missingOrWrongType(field: ${swiftStr(f.name)}, expected: ${swiftStr(arrayType)})`,
        )
        lines.push(`        }`)
        lines.push(
          `        result.${swiftIdent(f.name)} = try ${localBase(f.name)}Raw.map { try ${nestedType}.parse($0) }`,
        )
      }
      continue
    }
    if (f.optional) {
      // Optional field — missing → leave nil, present-but-wrong-type → throw
      lines.push(`        if let raw = input[${swiftStr(f.name)}] {`)
      lines.push(`            guard let ${localBase(f.name)}Val = raw as? ${t} else {`)
      lines.push(
        `                throw PyreonSchemaError.missingOrWrongType(field: ${swiftStr(f.name)}, expected: ${swiftStr(t)})`,
      )
      lines.push(`            }`)
      // Gap 4 v3 — constraints on optional fields apply ONLY when the
      // field is present (the missing-case left nil above).
      emitSwiftScalarConstraints(
        lines,
        `${localBase(f.name)}Val`,
        f.type,
        f.constraints,
        f.name,
        12,
      )
      // Gap 4 v3 — element constraints for optional arrays apply per-element.
      emitSwiftArrayElementConstraints(lines, `${localBase(f.name)}Val`, f.type, f.name, 12)
      lines.push(`            result.${swiftIdent(f.name)} = ${localBase(f.name)}Val`)
      lines.push(`        }`)
      continue
    }
    lines.push(
      `        guard let ${localBase(f.name)}Val = input[${swiftStr(f.name)}] as? ${t} else {`,
    )
    lines.push(
      `            throw PyreonSchemaError.missingOrWrongType(field: ${swiftStr(f.name)}, expected: ${swiftStr(t)})`,
    )
    lines.push(`        }`)
    // Gap 4 v2.1 — enforce scalar constraints from the modifier chain.
    emitSwiftScalarConstraints(
      lines,
      `${localBase(f.name)}Val`,
      f.type,
      f.constraints,
      f.name,
      8,
    )
    // Gap 4 v3 — enforce per-element constraints for array fields.
    emitSwiftArrayElementConstraints(lines, `${localBase(f.name)}Val`, f.type, f.name, 8)
    lines.push(`        result.${swiftIdent(f.name)} = ${localBase(f.name)}Val`)
  }
  lines.push(`        return result`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(
    `    static func safeParse(_ input: [String: Any]) -> Result<Self, PyreonSchemaError> {`,
  )
  lines.push(`        do { return .success(try parse(input)) }`)
  lines.push(`        catch let e as PyreonSchemaError { return .failure(e) }`)
  lines.push(`        catch { return .failure(.unknown) }`)
  lines.push(`    }`)
  // Per-FIELD validation, so `useForm({ schema })` can wire the schema into the
  // form. `PyreonForm` takes `[String: (String) -> String]` ("" = valid), and
  // without this the option was dropped SILENTLY: `isValid` stayed true on
  // native for input the web rejected. Found by the iOS device gate.
  //
  // Reuses `emitSwiftScalarConstraints` — the same generator `parse()` uses —
  // so the two can never disagree about what a constraint means. Only STRING
  // fields are emitted: a form Field is a text input, and a non-string field is
  // not bound to one.
  const _stringFields = zs.fields.filter((f) => f.type === 'string')
  if (_stringFields.length > 0) {
    lines.push(``)
    lines.push(`    /// "" when valid, else the violated rule — the PyreonForm validator shape.`)
    lines.push(`    static func validateField(_ field: String, _ value: String) -> String {`)
    lines.push(`        do {`)
    lines.push(`            switch field {`)
    for (const f of _stringFields) {
      lines.push(`            case ${swiftStr(f.name)}:`)
      const guards: string[] = []
      emitSwiftScalarConstraints(guards, 'value', 'string', f.constraints, f.name, 16)
      if (guards.length === 0) guards.push(`                break`)
      lines.push(...guards)
    }
    lines.push(`            default: break`)
    lines.push(`            }`)
    lines.push(`        } catch let e as PyreonSchemaError {`)
    lines.push(`            if case .constraintViolation(_, let rule) = e { return rule }`)
    lines.push(`            return "invalid"`)
    lines.push(`        } catch { return "invalid" }`)
    lines.push(`        return ""`)
    lines.push(`    }`)
  }
  // Standalone-validation: the web-faithful result shape. `s.object({ … })
  // .safeParse(x)` returns `{ success, data }` on the web, but Swift's `Result`
  // carries no `.success` Bool — so an inline-validated schema also gets a
  // `safeParseResult` returning `PyreonParseResult<Self>` (success + data).
  if (zs.emitSafeParseResult) {
    lines.push(``)
    lines.push(
      `    static func safeParseResult(_ input: [String: Any]) -> PyreonParseResult<Self> {`,
    )
    lines.push(`        switch safeParse(input) {`)
    lines.push(`        case .success(let v): return PyreonParseResult(success: true, data: v)`)
    lines.push(`        case .failure: return PyreonParseResult(success: false, data: nil)`)
    lines.push(`        }`)
    lines.push(`    }`)
  }
  lines.push(`}`)
  // An INLINE schema (synthesized from `s.object({ … }).safeParse(x)`) is
  // referenced only through its static `safeParseResult` — it needs no
  // module-scope instance binding (which exists so a top-level schema NAME
  // resolves as a value).
  if (!zs.inline) {
    lines.push(``)
    lines.push(`let ${zs.bindingName} = PyreonZodSchema_${zs.bindingName}()`)
  }
  return lines.join('\n')
}

/**
 * A schema and its auxiliary schemas as separate declarations, auxiliaries FIRST so Swift resolves the type
 * references top-down.
 */
export function emitSwiftSchemaTree(zs: ZodSchemaDefnIR): string[] {
  return [...(zs.auxSchemas ?? []).flatMap(emitSwiftSchemaTree), emitSwiftZodSchema(zs)]
}
