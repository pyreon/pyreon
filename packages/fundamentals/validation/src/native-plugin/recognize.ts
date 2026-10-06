// The schema recognizers shared by every library whose schemas lower to a native struct: `zodSchema(z.object({…}))`,
// `valibotSchema(v.object({…}))`, `arktypeSchema(type({…}))` and `@pyreon/validate`'s wrapper-less `s.object({…})`.
//
// All four are ONE grammar with a different namespace prefix, which is why the field walker is parameterised over
// the wrapper call (`schemaFn`, null for `s`) and the prefix rather than copied per library. The walker reads the
// AST structurally (ESTree nodes, as the compiler's parser produced them) and returns the plugin's own
// `ZodSchemaDefnIR` model; nothing here touches the compiler's parser or emitters.

import {
  dynamicKeyText,
  hasDynamicKey,
  staticPropKey,
  unwrapTypeLayers,
  type ModuleParseContext,
} from '@pyreon/native-compiler/plugin-api'
import type { ZodFieldConstraints, ZodFieldType, ZodSchemaDefnIR } from './ir'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

function warnDynamicKey(prop: AnyNode, where: string, ctx: ModuleParseContext): void {
  ctx.report(
    `${where}: the computed key \`${dynamicKeyText(prop, ctx)}\` is only known at runtime, so this entry cannot be read at compile time and does not lower to native. Write the key literally (\`{ input: … }\`, not \`{ [kind]: … }\`).`,
  )
}

/**
 * `.regex(/…/)` → a portable pattern, or `null` with a warning naming why.
 *
 * The recognizer had no `regex` arm at all, so the modifier fell straight
 * through its `else if` chain: the field emitted with only a type guard, no
 * check and no diagnostic. A schema that rejects `"Not A Slug!"` on the web
 * ACCEPTED it on device — a validation bypass with nothing to trace it by.
 *
 * The three engines (JS, NSRegularExpression, java.util.regex) agree on the
 * common syntax — anchors, classes, quantifiers, groups, alternation — and
 * diverge on the rest. Rather than emit a check that might disagree with the
 * web, anything carrying JS-specific syntax or a non-portable flag declines
 * BY NAME. A declined field is no worse off than before; it is just no
 * longer silent.
 */
function tryPortableRegexLiteral(
  node: AnyNode | undefined,
  fieldLabel: string,
  ctx: ModuleParseContext,
): { source: string; ignoreCase: boolean } | null {
  const re = node?.type === 'Literal' ? (node.regex as { pattern?: string; flags?: string } | undefined) : undefined
  if (!re || typeof re.pattern !== 'string') {
    ctx.report(
      `${fieldLabel}: .regex() needs an inline regular-expression literal to lower natively — this argument is not one, so the field is NOT validated on device.`,
    )
    return null
  }
  const flags = re.flags ?? ''
  // `i` maps to both engines. `g`/`y` are stateful-iteration flags with no
  // meaning for a single test; `s`/`u`/`v`/`m`/`d` change matching semantics
  // in ways that do not port identically.
  const unportableFlags = [...flags].filter((f) => f !== 'i')
  if (unportableFlags.length > 0) {
    ctx.report(
      `${fieldLabel}: .regex() flag(s) \`${unportableFlags.join('')}\` do not port to NSRegularExpression / java.util.regex, so the field is NOT validated on device. Only the \`i\` flag lowers.`,
    )
    return null
  }
  // JS-only constructs. Named groups and lookbehind exist in the newer
  // engines but not identically across the OS versions PMTC targets, and a
  // pattern that means something different on device is worse than one that
  // openly does not run.
  const jsOnly = [
    ['\\d', null],
  ] as const
  void jsOnly
  const unportable = /\(\?<[=!]|\\p\{|\\P\{|\(\?<[A-Za-z_]/.test(re.pattern)
  if (unportable) {
    ctx.report(
      `${fieldLabel}: .regex() uses lookbehind, a named group or a Unicode property escape, which do not port identically to NSRegularExpression / java.util.regex — the field is NOT validated on device.`,
    )
    return null
  }
  // The emitters embed the source in a Swift raw string and a Kotlin string;
  // a pattern containing the raw-string terminator cannot be embedded safely.
  if (re.pattern.includes('"#')) {
    ctx.report(
      `${fieldLabel}: .regex() pattern contains \`"#\`, which cannot be embedded in the emitted Swift raw string — the field is NOT validated on device.`,
    )
    return null
  }
  return { source: re.pattern, ignoreCase: flags.includes('i') }
}

/**
 * The URL rule a `.url(...)` call lowers to -- or null, with a warning, when it
 * cannot lower faithfully (see `UrlRule` for why the library matters).
 *
 * Only `@pyreon/validate` has a `protocol` option. It lowers when it is an
 * inline regular-expression literal that ports (the same test `.regex()`
 * applies); anything else DECLINES by name rather than falling back to the
 * default rule, which would reject on device the schemes the web accepts.
 * zod's `.url(...)` options (`hostname`, its own `protocol`) are not read, as
 * before -- its rule was, and stays, "any scheme".
 */
function urlRule(
  arg: AnyNode | undefined,
  pyreonValidate: boolean,
  label: string,
  ctx: ModuleParseContext,
): ZodFieldConstraints['url'] | null {
  if (!pyreonValidate) return { kind: 'scheme' }
  if (!arg) return { kind: 'http' }
  const opts = unwrapTypeLayers(arg) as AnyNode | undefined
  if (opts?.type !== 'ObjectExpression') {
    ctx.report(
      `${label}: the options argument is not an inline object, so whether it sets \`protocol\` cannot be read — the field is NOT URL-validated on device. Write the options inline: \`.url({ protocol: /^https?$/ })\`.`,
    )
    return null
  }
  let protocol: AnyNode | undefined
  for (const p of (opts.properties as AnyNode[] | undefined) ?? []) {
    if (p?.type !== 'Property' && p?.type !== 'ObjectProperty') {
      ctx.report(
        `${label}: a spread in the options cannot be read, so whether it sets \`protocol\` is unknown — the field is NOT URL-validated on device. Write \`protocol\` inline.`,
      )
      return null
    }
    if (hasDynamicKey(p)) {
      ctx.report(
        `${label}: the computed key \`${dynamicKeyText(p, ctx)}\` in the options cannot be read, so whether it sets \`protocol\` is unknown — the field is NOT URL-validated on device. Write \`protocol\` inline.`,
      )
      return null
    }
    if (staticPropKey(p) === 'protocol') protocol = p.value as AnyNode | undefined
  }
  if (protocol === undefined) return { kind: 'http' }
  const re = tryPortableRegexLiteral(protocol, `${label} protocol`, ctx)
  if (!re) return null
  return { kind: 'protocol', source: re.source, ignoreCase: re.ignoreCase }
}

/**
 * Gap 4 v3 — walk a `z.X()...modifier()...modifier()` chain and return
 * the base method name plus accumulated constraints. Used both for
 * top-level field types AND for the inner element of `z.array(...)`.
 * Returns null when the expression doesn't have the `<prefix>.X()`
 * shape after the chain unwinds. Does NOT recognize `.optional()` /
 * `.nullable()` — those are handled at the field level only (an
 * `optional` array element isn't part of the v3 contract).
 */
function extractTypeAndConstraints(
  expr: AnyNode,
  prefix: string,
  ctx: ModuleParseContext,
  /** `@pyreon/validate`'s `s` DSL, whose `.url()` differs from zod's. */
  pyreonValidate: boolean,
): { method: string; constraints: ZodFieldConstraints; integer: boolean } | null {
  const constraints: ZodFieldConstraints = {}
  let integer = false
  let cursor: AnyNode | undefined = expr
  while (cursor && cursor.type === 'CallExpression') {
    const callee = cursor.callee as AnyNode | undefined
    if (
      callee?.type === 'MemberExpression' &&
      callee.object?.type === 'CallExpression' &&
      callee.property?.type === 'Identifier'
    ) {
      const modName = callee.property.name as string
      const modArgs = (cursor.arguments as AnyNode[] | undefined) ?? []
      const firstArg = modArgs[0]
      if (modName === 'min') {
        if (
          firstArg &&
          firstArg.type === 'Literal' &&
          typeof firstArg.value === 'number'
        ) {
          constraints.min = firstArg.value
        }
      } else if (modName === 'max') {
        if (
          firstArg &&
          firstArg.type === 'Literal' &&
          typeof firstArg.value === 'number'
        ) {
          constraints.max = firstArg.value
        }
      } else if (modName === 'email') {
        constraints.email = true
      } else if (modName === 'url') {
        const rule = urlRule(firstArg, pyreonValidate, 'schema element .url()', ctx)
        if (rule) constraints.url = rule
      } else if (modName === 'uuid') {
        constraints.uuid = true
      } else if (modName === 'regex') {
        const r = tryPortableRegexLiteral(firstArg, `schema element .regex()`, ctx)
        if (r) constraints.regex = r
      } else if (modName === 'int') {
        integer = true
      }
      // `.optional()` / `.nullable()` are deliberately NOT recognized
      // here — they apply at the field level, not to inner elements.
      cursor = callee.object as AnyNode
      continue
    }
    break
  }
  if (!cursor || cursor.type !== 'CallExpression') return null
  const baseCallee = cursor.callee as AnyNode | undefined
  if (
    baseCallee?.type !== 'MemberExpression' ||
    baseCallee.object?.type !== 'Identifier' ||
    (baseCallee.object.name as string) !== prefix ||
    baseCallee.property?.type !== 'Identifier'
  ) {
    return null
  }
  return {
    method: baseCallee.property.name as string,
    constraints,
    integer,
  }
}

/**
 * Gap 4 v3.2 — capitalize the first character of an identifier.
 * Used to synthesize aux schema names: `userSchema` + `address` →
 * `userSchema_Address`.
 */
function capitalizeFirst(s: string): string {
  if (s.length === 0) return s
  return s[0]!.toUpperCase() + s.slice(1)
}

/**
 * Gap 4 v3.2 — parse a `z.object({ ... })` CallExpression node into
 * a `ZodSchemaDefnIR` with the supplied `name` as `bindingName`. Used
 * for nested object fields. Returns null when the shape isn't a
 * literal `z.object({...})`.
 *
 * Implementation reuses `tryNamespacedSchemaDefnFromTopLevel`'s body
 * by synthesizing a wrapper VariableDeclaration that holds the
 * `<schemaFn>(z.object(...))` shape so we don't fork the walker.
 */
function parseNestedObjectShape(
  objectCallNode: AnyNode,
  name: string,
  ctx: ModuleParseContext,
  prefix: string,
  schemaFn: string | null,
): ZodSchemaDefnIR | null {
  // objectCallNode is `z.object({...})`. Wrap it as `<schemaFn>(z.object({...}))`
  // so the existing walker can extract fields + auxSchemas — EXCEPT for the
  // wrapper-LESS `s` DSL (`schemaFn === null`), whose own re-entry branch
  // (`tryNamespacedSchemaDefnFromTopLevel`'s `if (schemaFn === null) innerCall
  // = init`) expects `init` to BE the `<prefix>.object(...)` call directly —
  // wrapping it here built `<null>(objectCallNode)` (callee `{name: null}`,
  // not the required MemberExpression), so a nested `s.object({...})` inside
  // an `s.object`/`s.array` always failed to lower, silently dropping the
  // field and then the whole schema. Hand `objectCallNode` straight through
  // as `init` in that case.
  const wrapped: AnyNode = {
    type: 'VariableDeclaration',
    declarations: [
      {
        type: 'VariableDeclarator',
        id: { type: 'Identifier', name },
        init:
          schemaFn === null
            ? objectCallNode
            : {
                type: 'CallExpression',
                callee: { type: 'Identifier', name: schemaFn },
                arguments: [objectCallNode],
              },
      },
    ],
  }
  return tryNamespacedSchemaDefnFromTopLevel(
    wrapped,
    ctx,
    schemaFn,
    prefix,
    // libraryDisplay — falls back to the namespace prefix for the
    // wrapper-less form (`@pyreon/validate`'s `s.object(...)`).
    /* libraryDisplay (unused here) */ schemaFn ?? prefix,
  )
}

/**
 * Gap 4 v3.2 — recognize `z.object({...})` as an array element. If
 * yes, synthesize the aux schema. Returns null when the inner is NOT
 * a `z.object` CallExpression (the caller falls back to the primitive
 * element path).
 */
function tryParseInnerObjectElement(
  innerArg: AnyNode,
  name: string,
  ctx: ModuleParseContext,
  prefix: string,
  schemaFn: string | null,
): ZodSchemaDefnIR | null {
  if (innerArg.type !== 'CallExpression') return null
  const callee = innerArg.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression') return null
  if (callee.object?.type !== 'Identifier') return null
  if ((callee.object.name as string) !== prefix) return null
  if (callee.property?.type !== 'Identifier') return null
  if ((callee.property.name as string) !== 'object') return null
  return parseNestedObjectShape(innerArg, name, ctx, prefix, schemaFn)
}

/**
 * Gap 4 v3.3 — parse `z.discriminatedUnion('field', [z.object(...), ...])`.
 *
 * Each variant must be a `z.object()` containing a field with name
 * matching the discriminator and value `z.literal('xxx')`. Variants
 * are synthesized as aux schemas; the parent schema carries a
 * `discriminator` field listing them with their literal values + the
 * synthesized case names.
 */
function parseDiscriminatedUnion(
  innerCall: AnyNode,
  bindingName: string,
  ctx: ModuleParseContext,
  prefix: string,
  schemaFn: string | null,
): ZodSchemaDefnIR | null {
  const callArgs = (innerCall.arguments as AnyNode[] | undefined) ?? []
  // First arg = discriminator field name (string literal).
  const discrArg = callArgs[0]
  if (
    !discrArg ||
    discrArg.type !== 'Literal' ||
    typeof discrArg.value !== 'string'
  ) {
    ctx.report(
      `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() first arg must be a string literal field name — dropping.`,
    )
    return null
  }
  const discrField = discrArg.value
  // Second arg = array of z.object() variants.
  const variantsArg = callArgs[1]
  if (
    !variantsArg ||
    variantsArg.type !== 'ArrayExpression'
  ) {
    ctx.report(
      `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() second arg must be a literal array of ${prefix}.object() variants — dropping.`,
    )
    return null
  }
  const variantNodes = (variantsArg.elements as AnyNode[] | undefined) ?? []
  if (variantNodes.length === 0) {
    ctx.report(
      `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() needs at least one variant — dropping.`,
    )
    return null
  }
  const auxSchemas: ZodSchemaDefnIR[] = []
  const variants: NonNullable<ZodSchemaDefnIR['discriminator']>['variants'] = []
  for (let i = 0; i < variantNodes.length; i++) {
    const variantNode = variantNodes[i]!
    if (variantNode.type !== 'CallExpression') {
      ctx.report(
        `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() variant ${i} is not a ${prefix}.object() call — dropping.`,
      )
      return null
    }
    // Detect the literal value of the discriminator field BEFORE
    // synthesizing the aux schema — we need this for `case`-mapping.
    const literal = extractDiscriminatorLiteral(variantNode, discrField, prefix)
    if (literal === null) {
      ctx.report(
        `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() variant ${i} doesn't expose ${prefix}.literal() at "${discrField}" — dropping.`,
      )
      return null
    }
    const caseName = capitalizeFirst(literal.replace(/[^a-zA-Z0-9_]/g, '_'))
    const variantSchemaName = `${bindingName}_${caseName}`
    const variantSchema = parseNestedObjectShape(
      variantNode,
      variantSchemaName,
      ctx,
      prefix,
      schemaFn,
    )
    if (!variantSchema) {
      ctx.report(
        `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.discriminatedUnion() variant ${i} has an unparseable ${prefix}.object() shape — dropping.`,
      )
      return null
    }
    auxSchemas.push(variantSchema)
    variants.push({ literal, schemaName: variantSchemaName, caseName })
  }
  const result: ZodSchemaDefnIR = {
    bindingName,
    fields: [],
    discriminator: { field: discrField, variants },
  }
  if (auxSchemas.length > 0) result.auxSchemas = auxSchemas
  return result
}

/**
 * Gap 4 v3.3 — locate the discriminator field inside a variant's
 * `z.object({...})` shape and return its `z.literal()` value as a
 * string. Returns null when the field is missing OR its value isn't
 * a `<prefix>.literal('xxx')` call.
 */
function extractDiscriminatorLiteral(
  objectCallNode: AnyNode,
  discrField: string,
  prefix: string,
): string | null {
  if (objectCallNode.type !== 'CallExpression') return null
  const callee = objectCallNode.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression') return null
  if (callee.object?.type !== 'Identifier') return null
  if ((callee.object.name as string) !== prefix) return null
  if (callee.property?.type !== 'Identifier') return null
  if ((callee.property.name as string) !== 'object') return null
  const shapeArg = (objectCallNode.arguments as AnyNode[] | undefined)?.[0]
  if (!shapeArg || shapeArg.type !== 'ObjectExpression') return null
  for (const prop of (shapeArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    // A runtime computed key is skipped here; the variant's shape walker
    // names it. A literal discriminator elsewhere in the shape still wins.
    const fieldName = staticPropKey(prop)
    if (fieldName !== discrField) continue
    const value = prop.value as AnyNode | undefined
    if (value?.type !== 'CallExpression') return null
    const valCallee = value.callee as AnyNode | undefined
    if (valCallee?.type !== 'MemberExpression') return null
    if (valCallee.object?.type !== 'Identifier') return null
    if ((valCallee.object.name as string) !== prefix) return null
    if (valCallee.property?.type !== 'Identifier') return null
    if ((valCallee.property.name as string) !== 'literal') return null
    const litArg = (value.arguments as AnyNode[] | undefined)?.[0]
    if (
      !litArg ||
      litArg.type !== 'Literal' ||
      typeof litArg.value !== 'string'
    ) {
      return null
    }
    return litArg.value
  }
  return null
}

/**
 * Shared parser body for Zod + Valibot recognition (the two
 * libraries use isomorphic `<prefix>.object({ field: <prefix>.X() })`
 * call shapes). ArkType's string-valued shape needs its own parser.
 */
export function tryNamespacedSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ModuleParseContext,
  /**
   * The wrapper call the schema arrives inside (`zodSchema`, `valibotSchema`,
   * `arktypeSchema`), or NULL when the declaration is the namespaced call
   * itself. `@pyreon/validate`'s `s.object({ … })` needs no wrapper because it
   * already IS a Standard Schema; every other field-walking rule below is
   * identical, which is why this is a parameter rather than a second copy of
   * the walker.
   */
  schemaFn: string | null,
  prefix: string,
  libraryDisplay: string,
): ZodSchemaDefnIR | null {
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const bindingName = declarator.id.name as string

  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null

  let innerCall: AnyNode | undefined
  if (schemaFn === null) {
    // Wrapper-less form — the declaration IS `<prefix>.object({ … })`.
    innerCall = init
  } else {
    if (init.callee?.type !== 'Identifier') return null
    if ((init.callee.name as string) !== schemaFn) return null
    const args = (init.arguments as AnyNode[] | undefined) ?? []
    innerCall = args[0]
  }
  if (!innerCall || innerCall.type !== 'CallExpression') return null
  // innerCall.callee must be `<prefix>.object` MemberExpression.
  const innerCallee = innerCall.callee as AnyNode | undefined
  if (innerCallee?.type !== 'MemberExpression') return null
  if (innerCallee.object?.type !== 'Identifier') return null
  if ((innerCallee.object.name as string) !== prefix) return null
  if (innerCallee.property?.type !== 'Identifier') return null
  const innerCallMethod = innerCallee.property.name as string
  // Gap 4 v3.3 — discriminated union shape.
  if (innerCallMethod === 'discriminatedUnion') {
    return parseDiscriminatedUnion(
      innerCall,
      bindingName,
      ctx,
      prefix,
      schemaFn,
    )
  }
  if (innerCallMethod !== 'object') return null

  const shapeArg = (innerCall.arguments as AnyNode[] | undefined)?.[0]
  if (!shapeArg || shapeArg.type !== 'ObjectExpression') {
    ctx.report(
      `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.object() argument must be a literal shape — v1 emit needs the literal { field: ${prefix}.X() } map. Falling back to silent-drop.`,
    )
    return null
  }

  // Gap 4 v3.2 — auxiliary schemas synthesized while walking this
  // shape (one per nested z.object). Each carries its OWN fields +
  // its OWN auxSchemas (recursive). The emitter will emit them all
  // ahead of the main schema.
  const auxSchemas: ZodSchemaDefnIR[] = []

  // Walk shape's properties; each value should be a <prefix>.X() call (possibly chained).
  const fields: ZodSchemaDefnIR['fields'] = []
  for (const prop of (shapeArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (hasDynamicKey(prop)) {
      warnDynamicKey(prop, `${schemaFn ?? prefix} declaration \`${bindingName}\`: ${prefix}.object() shape`, ctx)
      continue
    }
    const fieldName = staticPropKey(prop)
    if (!fieldName) continue

    // Walk the chain twice: once to find the BASE <prefix>.X() call,
    // and once (top-down) to collect constraint modifiers.
    // v2.2 — also collect `.optional()` / `.nullable()` flags.
    const constraints: ZodFieldConstraints = {}
    let optional = false
    let integer = false
    let value = unwrapTypeLayers(prop.value as AnyNode | undefined) as AnyNode | undefined
    // First pass — collect modifiers from outermost call inward.
    let cursor: AnyNode | undefined = value
    while (cursor && cursor.type === 'CallExpression') {
      const callee = cursor.callee as AnyNode | undefined
      if (
        callee?.type === 'MemberExpression' &&
        callee.object?.type === 'CallExpression' &&
        callee.property?.type === 'Identifier'
      ) {
        const modName = callee.property.name as string
        const modArgs = (cursor.arguments as AnyNode[] | undefined) ?? []
        const firstArg = modArgs[0]
        if (modName === 'min') {
          if (
            firstArg &&
            firstArg.type === 'Literal' &&
            typeof firstArg.value === 'number'
          ) {
            constraints.min = firstArg.value
          }
        } else if (modName === 'max') {
          if (
            firstArg &&
            firstArg.type === 'Literal' &&
            typeof firstArg.value === 'number'
          ) {
            constraints.max = firstArg.value
          }
        } else if (modName === 'email') {
          constraints.email = true
        } else if (modName === 'url') {
          const rule = urlRule(firstArg, schemaFn === null, `schema field \`${fieldName}\` .url()`, ctx)
          if (rule) constraints.url = rule
        } else if (modName === 'uuid') {
          constraints.uuid = true
        } else if (modName === 'regex') {
          const r = tryPortableRegexLiteral(firstArg, `schema field .regex()`, ctx)
          if (r) constraints.regex = r
        } else if (modName === 'optional' || modName === 'nullable') {
          // Gap 4 v2.2 — `.optional()` / `.nullable()` mark the field
          // nullable on native. parse() returns nil instead of throwing
          // when missing.
          optional = true
        } else if (modName === 'int') {
          // `number().int()` — the ONLY spelling that promises a whole
          // number. A bare `number()` accepts `1.5`.
          integer = true
        }
        cursor = callee.object as AnyNode
        continue
      }
      break
    }
    value = cursor
    // value should now be a CallExpression whose callee is `<prefix>.X`.
    if (!value || value.type !== 'CallExpression') {
      ctx.report(
        `${schemaFn ?? prefix} declaration \`${bindingName}\`: field \`${fieldName}\` is not a ${prefix}.X() call — dropping.`,
      )
      continue
    }
    const baseCallee = value.callee as AnyNode | undefined
    if (
      baseCallee?.type !== 'MemberExpression' ||
      baseCallee.object?.type !== 'Identifier' ||
      (baseCallee.object.name as string) !== prefix ||
      baseCallee.property?.type !== 'Identifier'
    ) {
      ctx.report(
        `${schemaFn ?? prefix} declaration \`${bindingName}\`: field \`${fieldName}\` has unsupported shape (expected ${prefix}.string/${prefix}.number/${prefix}.boolean) — dropping.`,
      )
      continue
    }
    const method = baseCallee.property.name as string
    const hasConstraints = Object.keys(constraints).length > 0
    if (method === 'string') {
      const entry: ZodSchemaDefnIR['fields'][number] = { name: fieldName, type: 'string' }
      if (hasConstraints) entry.constraints = constraints
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'number') {
      const entry: ZodSchemaDefnIR['fields'][number] = { name: fieldName, type: 'number' }
      if (hasConstraints) entry.constraints = constraints
      if (optional) entry.optional = true
      if (integer) entry.integer = true
      fields.push(entry)
    } else if (method === 'boolean') {
      const entry: ZodSchemaDefnIR['fields'][number] = { name: fieldName, type: 'boolean' }
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'literal') {
      // Gap 4 v3.3 — `z.literal('xxx')` used inside discriminated-union
      // variants as the discriminator field. Inferred type from the
      // literal's runtime type (string / number / boolean). The literal
      // value is enforced at the union-level switch (per-variant
      // parse() just type-checks the field, not the value).
      const litArg = (value.arguments as AnyNode[] | undefined)?.[0]
      let litType: ZodFieldType = 'string'
      if (litArg && litArg.type === 'Literal') {
        const v = litArg.value
        if (typeof v === 'number') litType = 'number'
        else if (typeof v === 'boolean') litType = 'boolean'
      }
      const entry: ZodSchemaDefnIR['fields'][number] = {
        name: fieldName,
        type: litType,
      }
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'object') {
      // Gap 4 v3.2 — nested object field. Synthesize an auxiliary
      // schema named `<binding>_<field>` and reference it from the
      // field's type. The aux schema is added to `auxSchemas` so the
      // emitter renders it as its own struct/data class.
      const nested = parseNestedObjectShape(
        value,
        `${bindingName}_${capitalizeFirst(fieldName)}`,
        ctx,
        prefix,
        schemaFn,
      )
      if (!nested) {
        ctx.report(
          `${schemaFn ?? prefix} declaration \`${bindingName}\`: field \`${fieldName}\` is a nested ${prefix}.object() but its shape isn't a literal — dropping field.`,
        )
        continue
      }
      auxSchemas.push(nested)
      const entry: ZodSchemaDefnIR['fields'][number] = {
        name: fieldName,
        type: { kind: 'object', schemaName: nested.bindingName },
      }
      if (optional) entry.optional = true
      fields.push(entry)
    } else if (method === 'array') {
      // Gap 4 v2.2 — `z.array(z.string())` etc.
      // Gap 4 v3 — element modifier chain for per-element constraints.
      // Gap 4 v3.2 — `z.array(z.object({...}))` synthesizes a nested
      // schema for the element type.
      const innerArg = (value.arguments as AnyNode[] | undefined)?.[0] as
        | AnyNode
        | undefined
      // First check: is the inner element itself a z.object literal?
      const innerObjectSchema = innerArg
        ? tryParseInnerObjectElement(
            innerArg,
            `${bindingName}_${capitalizeFirst(fieldName)}_Item`,
            ctx,
            prefix,
            schemaFn,
          )
        : null
      if (innerObjectSchema) {
        auxSchemas.push(innerObjectSchema)
        const arrayType: Extract<ZodFieldType, { kind: 'array' }> = {
          kind: 'array',
          element: {
            kind: 'object',
            schemaName: innerObjectSchema.bindingName,
          },
        }
        const entry: ZodSchemaDefnIR['fields'][number] = {
          name: fieldName,
          type: arrayType,
        }
        if (optional) entry.optional = true
        fields.push(entry)
        continue
      }
      // Otherwise: primitive element (with possible per-element constraints)
      const inner = innerArg
        ? extractTypeAndConstraints(innerArg, prefix, ctx, schemaFn === null)
        : null
      let innerType: 'string' | 'number' | 'boolean' | undefined
      if (inner) {
        if (inner.method === 'string') innerType = 'string'
        else if (inner.method === 'number') innerType = 'number'
        else if (inner.method === 'boolean') innerType = 'boolean'
      }
      if (!innerType) {
        ctx.report(
          `${schemaFn ?? prefix} declaration \`${bindingName}\`: field \`${fieldName}\` is ${prefix}.array() with an unsupported inner type — supported: ${prefix}.array(${prefix}.string/${prefix}.number/${prefix}.boolean) and ${prefix}.array(${prefix}.object(...)). Dropping field.`,
        )
        continue
      }
      const arrayType: Extract<ZodFieldType, { kind: 'array' }> = {
        kind: 'array',
        element: innerType,
      }
      if (inner && Object.keys(inner.constraints).length > 0) {
        arrayType.elementConstraints = inner.constraints
      }
      if (inner?.integer === true && innerType === 'number') arrayType.elementInteger = true
      const entry: ZodSchemaDefnIR['fields'][number] = {
        name: fieldName,
        type: arrayType,
      }
      if (optional) entry.optional = true
      fields.push(entry)
    } else {
      ctx.report(
        `${schemaFn ?? prefix} declaration \`${bindingName}\`: field \`${fieldName}\` uses unsupported ${prefix}.${method}() — supported: ${prefix}.string / ${prefix}.number / ${prefix}.boolean / ${prefix}.array / ${prefix}.object. Dropping field.`,
      )
    }
    void libraryDisplay
  }

  if (fields.length === 0) {
    ctx.report(
      `${schemaFn ?? prefix} declaration \`${bindingName}\`: no recognized fields. Falling back to silent-drop.`,
    )
    return null
  }

  const result: ZodSchemaDefnIR = { bindingName, fields }
  if (auxSchemas.length > 0) result.auxSchemas = auxSchemas
  return result
}

/**
 * Gap 4 follow-up — `@pyreon/validation` Zod-schema v1 recognizer.
 * Matches the shape:
 *
 *   const userSchema = zodSchema(z.object({
 *     name: z.string(),
 *     age: z.number(),
 *     active: z.boolean(),
 *   }))
 *
 * Walks the call tree manually:
 *   - top: CallExpression callee Identifier `zodSchema`
 *   - arg[0]: CallExpression callee MemberExpression `z.object`
 *   - arg[0].arg[0]: ObjectExpression with z.string()/z.number()/z.boolean() values
 *
 * Schema modifier chains (`z.string().min(2).email()`) are unwrapped
 * at the head of the chain — we look for the BASE z.X() call.
 *
 * v1 emits shape only — no runtime validation methods. v2 follow-up
 * will add `.parse()` + `.safeParse()` runtime + constraint enforcement.
 */
export function tryZodSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ModuleParseContext,
): ZodSchemaDefnIR | null {
  return tryNamespacedSchemaDefnFromTopLevel(
    node,
    ctx,
    'zodSchema',
    'z',
    'zod',
  )
}

/**
 * Gap 4 follow-up — `@pyreon/validation` Valibot-schema v1 recognizer.
 * Same parser shape as Zod (`v.object({ field: v.X() })`) with the
 * `v` prefix instead. Matches:
 *
 *   const userSchema = valibotSchema(
 *     v.object({ name: v.string(), age: v.number() }),
 *     safeParse,
 *   )
 *
 * The 2nd `safeParse` arg is discarded — it's the runtime parse fn
 * used by the duck-typed Standard Schema wrapper, irrelevant on
 * native. v1 emits SHAPE only.
 */
export function tryValibotSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ModuleParseContext,
): ZodSchemaDefnIR | null {
  return tryNamespacedSchemaDefnFromTopLevel(
    node,
    ctx,
    'valibotSchema',
    'v',
    'valibot',
  )
}

/**
 * Gap 4 follow-up — `@pyreon/validation` ArkType-schema v1 recognizer.
 * ArkType uses STRING-VALUED type names instead of call-expression
 * field types (very different from Zod/Valibot):
 *
 *   const userSchema = arktypeSchema(type({
 *     name: 'string',
 *     age: 'number',
 *     active: 'boolean',
 *   }))
 *
 * Walks:
 *   - top: CallExpression callee Identifier `arktypeSchema`
 *   - arg[0]: CallExpression callee Identifier `type`
 *   - arg[0].arg[0]: ObjectExpression with string-literal values
 */
export function tryArktypeSchemaDefnFromTopLevel(
  node: AnyNode,
  ctx: ModuleParseContext,
): ZodSchemaDefnIR | null {
  let varDecl: AnyNode | null = null
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration'
  ) {
    varDecl = node.declaration
  } else if (node.type === 'VariableDeclaration') {
    varDecl = node
  }
  if (!varDecl) return null
  const declarators = varDecl.declarations as AnyNode[]
  if (declarators.length !== 1) return null
  const declarator = declarators[0]
  if (!declarator) return null
  if (declarator.id?.type !== 'Identifier') return null
  const bindingName = declarator.id.name as string

  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression') return null
  if (init.callee?.type !== 'Identifier') return null
  if ((init.callee.name as string) !== 'arktypeSchema') return null

  const args = (init.arguments as AnyNode[] | undefined) ?? []
  const innerCall = args[0]
  if (!innerCall || innerCall.type !== 'CallExpression') return null
  const innerCallee = innerCall.callee as AnyNode | undefined
  if (innerCallee?.type !== 'Identifier') return null
  if ((innerCallee.name as string) !== 'type') return null

  const shapeArg = (innerCall.arguments as AnyNode[] | undefined)?.[0]
  if (!shapeArg || shapeArg.type !== 'ObjectExpression') {
    ctx.report(
      `arktypeSchema declaration \`${bindingName}\`: type() argument must be a literal shape. Falling back to silent-drop.`,
    )
    return null
  }

  const fields: ZodSchemaDefnIR['fields'] = []
  for (const prop of (shapeArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (hasDynamicKey(prop)) {
      warnDynamicKey(prop, `arktypeSchema declaration \`${bindingName}\`: type() shape`, ctx)
      continue
    }
    const fieldName = staticPropKey(prop)
    if (!fieldName) continue
    const value = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (value?.type !== 'Literal' || typeof value.value !== 'string') {
      ctx.report(
        `arktypeSchema declaration \`${bindingName}\`: field \`${fieldName}\` is not a string-literal type — v1 supports 'string' | 'number' | 'boolean' literals. Dropping.`,
      )
      continue
    }
    const t = value.value
    if (t === 'string') {
      fields.push({ name: fieldName, type: 'string' })
    } else if (t === 'number') {
      fields.push({ name: fieldName, type: 'number' })
    } else if (t === 'boolean') {
      fields.push({ name: fieldName, type: 'boolean' })
    } else {
      ctx.report(
        `arktypeSchema declaration \`${bindingName}\`: field \`${fieldName}\` has unsupported type '${t}' — v1 supports 'string' | 'number' | 'boolean'. Dropping.`,
      )
    }
  }

  if (fields.length === 0) {
    ctx.report(
      `arktypeSchema declaration \`${bindingName}\`: no recognized fields. Falling back to silent-drop.`,
    )
    return null
  }

  return { bindingName, fields }
}

/**
 * Warn when a `@pyreon/validation` adapter call reaches the emit un-lowered.
 *
 * Pure and total over the three adapters: anything not matched by the inline
 * recognizers reaches here, so a new adapter is caught by adding its name to
 * the set rather than by remembering to warn at a new call site.
 */
export const SCHEMA_ADAPTERS: ReadonlySet<string> = new Set(['zodSchema', 'valibotSchema', 'arktypeSchema'])

export function warnUnloweredSchemaAdapter(node: AnyNode, ctx: ModuleParseContext): void {
  const varDecl =
    node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration'
      ? node.declaration
      : node.type === 'VariableDeclaration'
        ? node
        : null
  if (!varDecl) return
  const declarators = (varDecl.declarations as AnyNode[] | undefined) ?? []
  if (declarators.length !== 1) return
  const d = declarators[0]
  if (!d || d.id?.type !== 'Identifier') return
  const init = d.init as AnyNode | undefined
  if (init?.type !== 'CallExpression' || init.callee?.type !== 'Identifier') return
  const adapter = init.callee.name as string
  if (!SCHEMA_ADAPTERS.has(adapter)) return
  ctx.report(
    `\`${adapter}\` declaration \`${d.id.name as string}\`: the schema argument is not an inline ` +
      `literal, so no native struct is synthesized and the call is reproduced VERBATIM — the native ` +
      `build then fails on a symbol that exists only in JS (\`cannot find 'z' in scope\` / ` +
      `\`unresolved reference\`). Inline the schema at the call site ` +
      `(\`${adapter}(z.object({ … }))\`) so it can be lowered.`,
  )
}

