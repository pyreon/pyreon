// The Kotlin spelling of a lowered schema: a data class (a sealed class for a discriminated union) with
// `parse` / `safeParse`, per-field constraint checks, and the `validateField` a native form delegates to.
// Plugin-owned: the compiler core only calls `emitKotlinSchemaItem` through the item emitter.

import { KOTLIN_INT, kotlinMember, kotlinStr, localBase } from '@pyreon/native-compiler/plugin-api'
import type { ZodFieldConstraints, ZodFieldType, ZodSchemaDefnIR } from './ir'
import { HTTP_URL_PATTERN, URI_PATTERN } from './url-rule'

/**
 * Gap 4 follow-up — `@pyreon/validation` Zod-schema v1 emit (Kotlin).
 * Mirror of emitSwiftZodSchema. Produces a data class + module-scope
 * const. Apps validate at JSON-decode via kotlinx.serialization; v1
 * doesn't emit runtime .parse() methods (v2 follow-up).
 *
 *   data class PyreonZodSchema_userSchema(
 *       var name: String = "",
 *       var age: Int = 0,
 *       var active: Boolean = false,
 *   )
 *   val userSchema = PyreonZodSchema_userSchema()
 */
function kotlinFieldType(t: ZodFieldType): string {
  if (typeof t === 'string') {
    return t === 'string' ? 'String' : t === 'number' ? KOTLIN_INT : 'Boolean'
  }
  if (t.kind === 'object') {
    // Gap 4 v3.2 — nested object reference. Emit the synthesized data class name.
    return `PyreonZodSchema_${t.schemaName}`
  }
  // v2.2 array — element may now be a nested object (v3.2).
  let elem: string
  if (typeof t.element === 'string') {
    elem =
      t.element === 'string' ? 'String' : t.element === 'number' ? KOTLIN_INT : 'Boolean'
  } else {
    elem = `PyreonZodSchema_${t.element.schemaName}`
  }
  return `List<${elem}>`
}

function kotlinFieldInitial(t: ZodFieldType): string {
  if (typeof t === 'string') {
    return t === 'string' ? '""' : t === 'boolean' ? 'false' : '0'
  }
  if (t.kind === 'object') {
    // Initialize nested object with its own default constructor
    return `PyreonZodSchema_${t.schemaName}()`
  }
  return 'emptyList()'
}

/**
 * Gap 4 v2.1 + v3 — emit Kotlin constraint-check guards for a scalar
 * value. Used at three call sites: required scalar field, optional
 * scalar field (with nullable-receiver `?.` syntax), and array-element
 * loop body (with `ruleSuffix: " (element)"` for clearer messages).
 */
function emitKotlinScalarConstraints(
  lines: string[],
  targetName: string,
  t: ZodFieldType,
  constraints: ZodFieldConstraints | undefined,
  fieldName: string,
  indent: number,
  nullableTarget: boolean,
  ruleSuffix = '',
): void {
  if (!constraints) return
  const isString = t === 'string'
  const isNumber = t === 'number'
  if (!isString && !isNumber) return
  const ind = ' '.repeat(indent)
  const c = constraints
  // Nullable-receiver guards: `${target}?.length` returns Int? so we
  // compare with `??`-aware logic. For optional fields, "null target"
  // means "field absent" → constraint doesn't fire.
  const dot = nullableTarget ? '?.' : '.'
  const lenAccess = `${targetName}${dot}length`
  if (isString) {
    if (c.min !== undefined) {
      if (nullableTarget) {
        lines.push(
          `${ind}if (${targetName} != null && ${lenAccess}!! < ${c.min}) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "min length ${c.min}${ruleSuffix}")`,
        )
      } else {
        lines.push(
          `${ind}if (${lenAccess} < ${c.min}) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "min length ${c.min}${ruleSuffix}")`,
        )
      }
    }
    if (c.max !== undefined) {
      if (nullableTarget) {
        lines.push(
          `${ind}if (${targetName} != null && ${lenAccess}!! > ${c.max}) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "max length ${c.max}${ruleSuffix}")`,
        )
      } else {
        lines.push(
          `${ind}if (${lenAccess} > ${c.max}) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "max length ${c.max}${ruleSuffix}")`,
        )
      }
    }
    if (c.email) {
      const guard = nullableTarget ? `${targetName} != null && ` : ''
      lines.push(
        `${ind}if (${guard}!Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\\\.[A-Za-z]{2,}$").matches(${targetName}${nullableTarget ? '!!' : ''})) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "email${ruleSuffix}")`,
      )
    }
    if (c.url) {
      const guard = nullableTarget ? `if (${targetName} != null) ` : ''
      const v = `${targetName}${nullableTarget ? '!!' : ''}`
      const fail = `throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "url${ruleSuffix}")`
      // The AUTHORING library's rule (see `UrlRule`), not one rule for all.
      const rule = c.url
      if (rule.kind === 'scheme') {
        // zod: `URI(...)` PARSES; it does not validate. It accepts "not a
        // url", "x.com" and "/relative", all of which zod rejects. Requiring
        // a scheme reproduces zod's rule (an absolute URL) while still
        // accepting "mailto:a@b.co" and "ftp://x.com" as zod does.
        lines.push(
          `${ind}${guard}if ((try { java.net.URI(${v}).scheme } catch (_: Throwable) { null }) == null) ${fail}`,
        )
      } else if (rule.kind === 'http') {
        // `@pyreon/validate`'s default: http(s) with a host, exactly.
        lines.push(`${ind}${guard}if (!Regex(${kotlinStr(HTTP_URL_PATTERN)}).containsMatchIn(${v})) ${fail}`)
      } else {
        // `.url({ protocol })`: an absolute URI, then the scheme (the text
        // before the first colon) partially matched, as `RegExp.test()` is.
        const opts = rule.ignoreCase ? ', RegexOption.IGNORE_CASE' : ''
        lines.push(
          `${ind}${guard}if (!Regex(${kotlinStr(URI_PATTERN)}).containsMatchIn(${v}) || !Regex(${kotlinStr(rule.source)}${opts}).containsMatchIn(${v}.substringBefore(':'))) ${fail}`,
        )
      }
    }
    if (c.regex) {
      const guard = nullableTarget ? `if (${targetName} != null) ` : ''
      // `containsMatchIn`, not `matches` — `RegExp.test()` is a PARTIAL
      // match on the web, and an anchored pattern still anchors.
      const opts = c.regex.ignoreCase ? ', RegexOption.IGNORE_CASE' : ''
      const pattern = kotlinStr(c.regex.source)
      lines.push(
        `${ind}${guard}if (!Regex(${pattern}${opts}).containsMatchIn(${targetName}${nullableTarget ? '!!' : ''})) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "regex${ruleSuffix}")`,
      )
    }
    if (c.uuid) {
      const guard = nullableTarget ? `if (${targetName} != null) ` : ''
      lines.push(
        `${ind}${guard}try { java.util.UUID.fromString(${targetName}${nullableTarget ? '!!' : ''}) } catch (_: Throwable) { throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "uuid${ruleSuffix}") }`,
      )
    }
  } else if (isNumber) {
    if (c.min !== undefined) {
      if (nullableTarget) {
        lines.push(
          `${ind}if (${targetName} != null && ${targetName}!! < ${c.min}) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "min ${c.min}${ruleSuffix}")`,
        )
      } else {
        lines.push(
          `${ind}if (${targetName} < ${c.min}) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "min ${c.min}${ruleSuffix}")`,
        )
      }
    }
    if (c.max !== undefined) {
      if (nullableTarget) {
        lines.push(
          `${ind}if (${targetName} != null && ${targetName}!! > ${c.max}) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "max ${c.max}${ruleSuffix}")`,
        )
      } else {
        lines.push(
          `${ind}if (${targetName} > ${c.max}) throw PyreonSchemaError.ConstraintViolation(${kotlinStr(fieldName)}, "max ${c.max}${ruleSuffix}")`,
        )
      }
    }
  }
}

/**
 * Gap 4 v3 — emit a `for (elem in <field>Val) { ... }` loop applying
 * the array's `elementConstraints` to each element. For nullable
 * (optional) arrays, wrap in a null guard. No-op for scalars.
 */
function emitKotlinArrayElementConstraints(
  lines: string[],
  targetName: string,
  t: ZodFieldType,
  fieldName: string,
  indent: number,
  nullableTarget: boolean,
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
  if (nullableTarget) {
    lines.push(`${ind}if (${targetName} != null) {`)
    lines.push(`${ind}    for (${elementVar} in ${targetName}) {`)
    emitKotlinScalarConstraints(
      lines,
      elementVar,
      t.element,
      t.elementConstraints,
      fieldName,
      indent + 8,
      /* nullableTarget */ false,
      ' (element)',
    )
    lines.push(`${ind}    }`)
    lines.push(`${ind}}`)
  } else {
    lines.push(`${ind}for (${elementVar} in ${targetName}) {`)
    emitKotlinScalarConstraints(
      lines,
      elementVar,
      t.element,
      t.elementConstraints,
      fieldName,
      indent + 4,
      /* nullableTarget */ false,
      ' (element)',
    )
    lines.push(`${ind}}`)
  }
}

/**
 * Gap 4 v3.3 — emit a discriminated union as a Kotlin sealed class
 * with one data-class variant per case. Each variant wraps its aux
 * data class.
 */
function emitKotlinDiscriminatedUnion(zs: ZodSchemaDefnIR): string {
  const d = zs.discriminator!
  const typeName = `PyreonZodSchema_${zs.bindingName}`
  const lines: string[] = []
  lines.push(`sealed class ${typeName} {`)
  for (const v of d.variants) {
    lines.push(
      `    data class ${v.caseName}(val variant: PyreonZodSchema_${v.schemaName}) : ${typeName}()`,
    )
  }
  lines.push(`    companion object {`)
  lines.push(`        @Throws(PyreonSchemaError::class)`)
  lines.push(`        fun parse(input: Map<String, Any?>): ${typeName} {`)
  lines.push(
    `            val discr = (input[${kotlinStr(d.field)}] as? String)`,
  )
  lines.push(
    `                ?: throw PyreonSchemaError.MissingOrWrongType(${kotlinStr(d.field)}, "String")`,
  )
  lines.push(`            return when (discr) {`)
  for (const v of d.variants) {
    lines.push(
      `                ${kotlinStr(v.literal)} -> ${v.caseName}(PyreonZodSchema_${v.schemaName}.parse(input))`,
    )
  }
  lines.push(
    `                else -> throw PyreonSchemaError.ConstraintViolation(${kotlinStr(d.field)}, "unknown discriminator value")`,
  )
  lines.push(`            }`)
  lines.push(`        }`)
  lines.push(``)
  lines.push(
    `        fun safeParse(input: Map<String, Any?>): Result<${typeName}> {`,
  )
  lines.push(`            return try {`)
  lines.push(`                Result.success(parse(input))`)
  lines.push(`            } catch (e: PyreonSchemaError) {`)
  lines.push(`                Result.failure(e)`)
  lines.push(`            }`)
  lines.push(`        }`)
  lines.push(`    }`)
  lines.push(`}`)
  return lines.join('\n') + '\n'
}

export function emitKotlinZodSchema(zs: ZodSchemaDefnIR): string {
  // Gap 4 v3.3 — discriminated union: sealed-class shape.
  if (zs.discriminator) return emitKotlinDiscriminatedUnion(zs)
  const lines: string[] = []
  lines.push(`data class PyreonZodSchema_${zs.bindingName}(`)
  for (const f of zs.fields) {
    const t = kotlinFieldType(f.type)
    if (f.optional) {
      lines.push(`    var ${kotlinMember(f.name)}: ${t}? = null,`)
    } else {
      const initial = kotlinFieldInitial(f.type)
      lines.push(`    var ${kotlinMember(f.name)}: ${t} = ${initial},`)
    }
  }
  lines.push(`) {`)
  // Gap 4 v2 — runtime parse() / safeParse() companion methods.
  lines.push(`    companion object {`)
  lines.push(
    `        @Throws(PyreonSchemaError::class)`,
  )
  lines.push(
    `        fun parse(input: Map<String, Any?>): PyreonZodSchema_${zs.bindingName} {`,
  )
  for (const f of zs.fields) {
    const t = kotlinFieldType(f.type)
    // Gap 4 v3.2 — nested object field: route via the nested schema's
    // own parse() method.
    if (typeof f.type !== 'string' && f.type.kind === 'object') {
      const nestedType = `PyreonZodSchema_${f.type.schemaName}`
      if (f.optional) {
        lines.push(
          `            val ${localBase(f.name)}Val: ${nestedType}? = if (input.containsKey(${kotlinStr(f.name)})) {`,
        )
        lines.push(
          `                val raw = (input[${kotlinStr(f.name)}] as? Map<String, Any?>) ?: throw PyreonSchemaError.MissingOrWrongType(${kotlinStr(f.name)}, ${kotlinStr(nestedType)})`,
        )
        lines.push(`                ${nestedType}.parse(raw)`)
        lines.push(`            } else null`)
      } else {
        lines.push(
          `            val ${localBase(f.name)}Raw = (input[${kotlinStr(f.name)}] as? Map<String, Any?>)`,
        )
        lines.push(
          `                ?: throw PyreonSchemaError.MissingOrWrongType(${kotlinStr(f.name)}, ${kotlinStr(nestedType)})`,
        )
        lines.push(
          `            val ${localBase(f.name)}Val = ${nestedType}.parse(${localBase(f.name)}Raw)`,
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
      const arrayType = `List<${nestedType}>`
      if (f.optional) {
        lines.push(
          `            val ${localBase(f.name)}Val: ${arrayType}? = if (input.containsKey(${kotlinStr(f.name)})) {`,
        )
        lines.push(
          `                val raw = (input[${kotlinStr(f.name)}] as? List<Map<String, Any?>>) ?: throw PyreonSchemaError.MissingOrWrongType(${kotlinStr(f.name)}, ${kotlinStr(arrayType)})`,
        )
        lines.push(`                raw.map { ${nestedType}.parse(it) }`)
        lines.push(`            } else null`)
      } else {
        lines.push(
          `            val ${localBase(f.name)}Raw = (input[${kotlinStr(f.name)}] as? List<Map<String, Any?>>)`,
        )
        lines.push(
          `                ?: throw PyreonSchemaError.MissingOrWrongType(${kotlinStr(f.name)}, ${kotlinStr(arrayType)})`,
        )
        lines.push(
          `            val ${localBase(f.name)}Val = ${localBase(f.name)}Raw.map { ${nestedType}.parse(it) }`,
        )
      }
      continue
    }
    if (f.optional) {
      // Optional field: missing → null, present-but-wrong-type → throw
      lines.push(
        `            val ${localBase(f.name)}Val: ${t}? = if (input.containsKey(${kotlinStr(f.name)})) (input[${kotlinStr(f.name)}] as? ${t}) ?: throw PyreonSchemaError.MissingOrWrongType(${kotlinStr(f.name)}, ${kotlinStr(t)}) else null`,
      )
      // Gap 4 v3 — constraints on optional fields apply ONLY when present;
      // the null branch above leaves the field null untouched.
      emitKotlinScalarConstraints(
        lines,
        `${localBase(f.name)}Val`,
        f.type,
        f.constraints,
        f.name,
        12,
        /* nullableTarget */ true,
      )
      // Gap 4 v3 — element constraints for optional arrays apply per-element
      // when the array is present.
      emitKotlinArrayElementConstraints(
        lines,
        `${localBase(f.name)}Val`,
        f.type,
        f.name,
        12,
        /* nullableTarget */ true,
      )
      continue
    }
    lines.push(
      `            val ${localBase(f.name)}Val = (input[${kotlinStr(f.name)}] as? ${t})`,
    )
    lines.push(
      `                ?: throw PyreonSchemaError.MissingOrWrongType(${kotlinStr(f.name)}, ${kotlinStr(t)})`,
    )
    // Gap 4 v2.1 — scalar constraints.
    emitKotlinScalarConstraints(
      lines,
      `${localBase(f.name)}Val`,
      f.type,
      f.constraints,
      f.name,
      12,
      /* nullableTarget */ false,
    )
    // Gap 4 v3 — per-element constraints for required array fields.
    emitKotlinArrayElementConstraints(
      lines,
      `${localBase(f.name)}Val`,
      f.type,
      f.name,
      12,
      /* nullableTarget */ false,
    )
  }
  const ctorArgs = zs.fields.map((f) => `${kotlinMember(f.name)} = ${localBase(f.name)}Val`).join(', ')
  lines.push(
    `            return PyreonZodSchema_${zs.bindingName}(${ctorArgs})`,
  )
  lines.push(`        }`)
  lines.push(``)
  lines.push(
    `        fun safeParse(input: Map<String, Any?>): Result<PyreonZodSchema_${zs.bindingName}> {`,
  )
  lines.push(`            return try {`)
  lines.push(`                Result.success(parse(input))`)
  lines.push(`            } catch (e: PyreonSchemaError) {`)
  lines.push(`                Result.failure(e)`)
  lines.push(`            }`)
  lines.push(`        }`)
  // Per-FIELD validation — the Kotlin mirror of the Swift `validateField`, so
  // `useForm({ schema })` can wire the schema into the form. PyreonForm takes
  // `Map<String, (String) -> String>` ("" = valid); without this the option was
  // dropped SILENTLY and `isValid` stayed true for input the web rejects.
  //
  // Reuses `emitKotlinScalarConstraints`, the same generator `parse()` uses, so
  // the two cannot disagree about what a constraint means. STRING fields only:
  // a form Field is a text input.
  const _kStringFields = zs.fields.filter((f) => f.type === 'string')
  if (_kStringFields.length > 0) {
    lines.push(``)
    lines.push(`        /** "" when valid, else the violated rule — the PyreonForm validator shape. */`)
    lines.push(`        fun validateField(field: String, value: String): String {`)
    lines.push(`            try {`)
    lines.push(`                when (field) {`)
    for (const f of _kStringFields) {
      lines.push(`                    ${kotlinStr(f.name)} -> {`)
      const guards: string[] = []
      emitKotlinScalarConstraints(guards, 'value', 'string', f.constraints, f.name, 24, false)
      if (guards.length === 0) guards.push(`                        Unit`)
      lines.push(...guards)
      lines.push(`                    }`)
    }
    lines.push(`                    else -> Unit`)
    lines.push(`                }`)
    lines.push(`            } catch (e: PyreonSchemaError.ConstraintViolation) {`)
    lines.push(`                return e.rule`)
    lines.push(`            } catch (e: PyreonSchemaError) {`)
    lines.push(`                return "invalid"`)
    lines.push(`            }`)
    lines.push(`            return ""`)
    lines.push(`        }`)
  }
  // Standalone-validation: the web-faithful `{ success, data }` result.
  // Kotlin's `Result` carries no `.success` Bool, so an inline-validated
  // schema also gets `safeParseResult` → `PyreonParseResult<T>`.
  if (zs.emitSafeParseResult) {
    lines.push(``)
    lines.push(
      `        fun safeParseResult(input: Map<String, Any?>): PyreonParseResult<PyreonZodSchema_${zs.bindingName}> {`,
    )
    lines.push(`            return try {`)
    lines.push(`                PyreonParseResult(true, parse(input))`)
    lines.push(`            } catch (e: PyreonSchemaError) {`)
    lines.push(`                PyreonParseResult(false, null)`)
    lines.push(`            }`)
    lines.push(`        }`)
  }
  lines.push(`    }`)
  lines.push(`}`)
  // An INLINE schema is referenced only through its static `safeParseResult`,
  // so it needs no module-scope instance binding.
  if (!zs.inline) {
    lines.push(``)
    lines.push(`val ${zs.bindingName} = PyreonZodSchema_${zs.bindingName}()`)
  }
  return lines.join('\n')
}

/**
 * A schema and its auxiliary schemas as separate declarations, auxiliaries FIRST so the type references read
 * top-down.
 */
export function emitKotlinSchemaTree(zs: ZodSchemaDefnIR): string[] {
  return [...(zs.auxSchemas ?? []).flatMap(emitKotlinSchemaTree), emitKotlinZodSchema(zs)]
}
