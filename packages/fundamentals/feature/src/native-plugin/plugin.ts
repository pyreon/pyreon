// How `@pyreon/feature` crosses to native: `const Todo = defineFeature({ name: 'todo', schema: { id: 'string', … } })`
// lowers to a schema struct plus a module-scope binding exposing `name` and `initialValues`.
//
//   Swift   → `struct PyreonFeatureSchema_Todo: Codable`, `enum PyreonFeature_Todo`, `let Todo = PyreonFeature_Todo.self`
//   Kotlin  → `data class PyreonFeatureSchema_Todo`, `object PyreonFeature_Todo`, `val Todo = PyreonFeature_Todo`
//
// Two schema shapes lower: the LITERAL map (`{ field: 'string' | 'number' | 'boolean' }`) and an object LITERAL of scalar
// validators (`z.object({ id: z.string(), done: z.boolean() })`, the same shape under another namespace). A scalar field
// reads through its modifier chain. The emitted struct holds the field's type and nothing else, so the validator object ALSO
// lowers to the `@pyreon/validation` schema struct (`PyreonZodSchema_<binding>_schema`): `<binding>.schema.safeParse(x)` enforces
// `.min()`, `.email()`, … on device and returns the web's `{ success, data }`. What no struct can carry (`.refine()`, …) is reported
// BY NAME by the schema walker; `.parse()` throws and is reported too. A
// non-literal schema (a variable, `v.pipe(…)`, ArkType), a non-literal name and the CRUD runtime (`useList`,
// `useById`, …) fall to the Tier-2 diagnostic.

import {
  createSchemaItem,
  createSchemaStructRefinement,
  safeParseExpr,
  SCHEMA_ITEM_TYPE,
  schemaItemSpec,
  schemaOf,
  tryNamespacedSchemaDefnFromTopLevel,
} from '@pyreon/validation/native-plugin'
import {
  KOTLIN_INT,
  hasDynamicKey,
  kotlinMember,
  kotlinStr,
  staticPropKey,
  swiftCodingKeysLines,
  swiftIdent,
  swiftStr,
  topLevelDeclarators,
  unwrapTypeLayers,
  type CompilerPlugin,
  type ExtItemSpec,
  type MethodCallRecognizer,
  type ModuleFinish,
  type ModuleItemEmitter,
  type ModuleScan,
  type TopLevelRecognizer,
} from '@pyreon/native-compiler/plugin-api'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const FEATURE_PLUGIN_NAME = '@pyreon/feature'
const ITEM_TYPE = 'feature'

type FieldType = 'string' | 'number' | 'boolean'
interface FeaturePayload {
  bindingName: string
  featureName: string
  fields: { name: string; type: FieldType }[]
}

const payloadOf = (item: { payload: unknown }): FeaturePayload => item.payload as unknown as FeaturePayload

const SCALARS: ReadonlySet<string> = new Set(['string', 'number', 'boolean'])

/** Chain methods the declaration DOES carry: `.int()` is what a number field's native `Int` already means. */
const CARRIED: ReadonlySet<string> = new Set(['int'])

/**
 * `z.string().min(3).optional()` → `{ type: 'string', chain: ['min', 'optional'] }`. The root is the innermost call and
 * must be `<namespace>.string|number|boolean()`; anything else (`z.array(…)`, `v.pipe(…)`, a reference) is `null`.
 */
function scalarValidator(node: AnyNode | undefined): { type: FieldType; chain: string[] } | null {
  const chain: string[] = []
  let cur = unwrapTypeLayers(node)
  while (cur?.type === 'CallExpression' && cur.callee?.type === 'MemberExpression' && !cur.callee.computed) {
    const method = cur.callee.property?.name as string | undefined
    const object = unwrapTypeLayers(cur.callee.object as AnyNode | undefined)
    if (method === undefined) return null
    if (object?.type === 'Identifier') {
      return SCALARS.has(method) ? { type: method as FieldType, chain: chain.reverse() } : null
    }
    chain.push(method)
    cur = object
  }
  return null
}

/** The object literal inside `<namespace>.object({ … })`, else `undefined`. */
function validatorObject(node: AnyNode | undefined): AnyNode | undefined {
  if (node?.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression' || node.callee.computed) return undefined
  if (node.callee.property?.name !== 'object' || unwrapTypeLayers(node.callee.object)?.type !== 'Identifier') return undefined
  const arg = unwrapTypeLayers(((node.arguments as AnyNode[] | undefined) ?? [])[0])
  return arg?.type === 'ObjectExpression' ? arg : undefined
}

/** Per-file memory (`fileState`): the compiler never reads it. */
interface FeatureFacts {
  /** File-scope `defineFeature` bindings whose `schema` is a validator object, so `<binding>.schema` names a native schema struct. */
  readonly schemaBindings: Set<string>
  /** Bindings whose `<binding>.schema.safeParse(x)` lowered — `finishModule` gives each schema its `safeParseResult`. */
  readonly safeParseBindings: Set<string>
}

const FACTS_KEY = '@pyreon/feature:facts'

function featureFacts(source: { fileState<T>(key: string, init: () => T): T }): FeatureFacts {
  return source.fileState<FeatureFacts>(FACTS_KEY, () => ({ schemaBindings: new Set(), safeParseBindings: new Set() }))
}

/** The name of the native schema struct a feature's validator `schema` lowers to (`PyreonZodSchema_<this>`). */
const schemaStructName = (bindingName: string): string => `${bindingName}_schema`

/** `defineFeature({ …, schema: <ns>.object({…}) })`'s validator-object node, else `undefined`. */
function featureValidatorSchema(init: AnyNode | undefined): AnyNode | undefined {
  if (init?.type !== 'CallExpression' || init.callee?.type !== 'Identifier' || init.callee.name !== 'defineFeature') return undefined
  const config = ((init.arguments as AnyNode[] | undefined) ?? [])[0]
  if (config?.type !== 'ObjectExpression') return undefined
  for (const prop of (config.properties as AnyNode[] | undefined) ?? []) {
    if ((prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') || staticPropKey(prop) !== 'schema') continue
    const value = unwrapTypeLayers(prop.value as AnyNode | undefined)
    return validatorObject(value) !== undefined ? value : undefined
  }
  return undefined
}

/** The pre-pass: record every file-scope feature whose schema is a validator object (a component can sit above the declaration). */
function scanFeatures(scan: ModuleScan): void {
  const facts = featureFacts(scan)
  for (const node of scan.body as readonly AnyNode[]) {
    for (const d of topLevelDeclarators(node) as readonly AnyNode[]) {
      if (d.id?.type === 'Identifier' && featureValidatorSchema(d.init as AnyNode) !== undefined) {
        facts.schemaBindings.add(d.id.name as string)
      }
    }
  }
}

const SCHEMA_PARSE_THROWS =
  '`.parse()` THROWS on invalid input, which needs a native error model (try/throw lowering) PMTC does not carry yet. Use `.safeParse(x)` and branch on `.success`.'

/**
 * `Todo.schema.safeParse(x)` — the feature's own validator, lowered to the schema struct `defineFeature` declares alongside
 * the feature, so the constraints the web enforces (`.min()`, `.email()`, …) are enforced on device too. The result is
 * `{ success, data }`, like the web's. Any other member of `Todo.schema` is reported by name; a receiver that is not a feature's
 * `.schema` falls through.
 */
const recognizeFeatureSchemaCall: MethodCallRecognizer = (site, ctx) => {
  const facts = featureFacts(ctx)
  if (facts.schemaBindings.size === 0) return undefined
  const node = site.node as AnyNode
  const callee = node.callee as AnyNode | undefined
  if (callee?.type !== 'MemberExpression' || callee.computed || callee.property?.type !== 'Identifier') return undefined
  const receiver = callee.object as AnyNode
  if (receiver?.type !== 'MemberExpression' || receiver.computed || receiver.property?.name !== 'schema') return undefined
  if (receiver.object?.type !== 'Identifier' || !facts.schemaBindings.has(receiver.object.name as string)) return undefined
  const binding = receiver.object.name as string
  const method = callee.property.name as string
  if (method === 'safeParse') {
    const argNode = (node.arguments as AnyNode[] | undefined)?.[0]
    const arg = argNode ? ctx.expr(argNode) : { kind: 'object' as const, fields: [] }
    facts.safeParseBindings.add(binding)
    return { type: 'safeParse', payload: { schemaName: schemaStructName(binding) }, args: [arg] }
  }
  return ctx.unsupported(
    node,
    `\`${binding}.schema.${method}(…)\``,
    method === 'parse'
      ? SCHEMA_PARSE_THROWS
      : 'only `.safeParse(x)` on a feature schema lowers to native. Keep this call in a web-only helper.',
  )
}

/** Give each feature schema whose `safeParse` lowered the `safeParseResult` that call goes through. */
const finishFeature: ModuleFinish = ({ items, report, fileState }) => {
  for (const binding of featureFacts({ fileState }).safeParseBindings) {
    const name = schemaStructName(binding)
    const item = items.find(
      (i) => i.plugin === FEATURE_PLUGIN_NAME && i.type === SCHEMA_ITEM_TYPE && schemaOf(i).bindingName === name,
    )
    if (item) schemaOf(item).emitSafeParseResult = true
    else {
      report(
        `\`${binding}.schema.safeParse(…)\` references a feature schema whose validators did not lower to a native struct (see the warning above), so the call cannot compile on iOS/Android.`,
      )
    }
  }
}

/** `const Todo = defineFeature({ name, schema: { …literal… } })` at file scope, else `undefined` (the node falls through). */
const recognizeFeature: TopLevelRecognizer = (node, ctx): ExtItemSpec | undefined => {
  const declarators = topLevelDeclarators(node) as readonly AnyNode[]
  if (declarators.length !== 1) return undefined
  const declarator = declarators[0]
  if (declarator?.id?.type !== 'Identifier') return undefined
  const bindingName = declarator.id.name as string
  const init = declarator.init as AnyNode | undefined
  if (init?.type !== 'CallExpression' || init.callee?.type !== 'Identifier' || init.callee.name !== 'defineFeature') return undefined

  const configArg = ((init.arguments as AnyNode[] | undefined) ?? [])[0]
  // The Tier-2 diagnostic catches a call that is not even an object.
  if (!configArg || configArg.type !== 'ObjectExpression') return undefined

  let featureName: string | undefined
  let schemaNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `defineFeature declaration \`${bindingName}\`: config`)
      continue
    }
    const keyName = staticPropKey(prop)
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'name') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') featureName = valueNode.value
    } else if (keyName === 'schema') {
      schemaNode = valueNode
    }
    // `api`, `fetcher`, `initialValues` and `validate` are deliberately dropped: the CRUD runtime is not ported.
  }

  if (!featureName) {
    ctx.report(
      `defineFeature declaration \`${bindingName}\`: \`name\` field is missing or not a string literal — v1 emit requires the literal shape. Falling back to tier2 silent-drop.`,
    )
    return undefined
  }
  // `z.object({ … })` reads through to its field map; the validators are read per field below.
  const validators = validatorObject(schemaNode)
  const fieldMap = validators ?? schemaNode
  if (!fieldMap || fieldMap.type !== 'ObjectExpression') {
    ctx.report(
      `defineFeature declaration \`${bindingName}\`: \`schema\` is not a literal object — only the literal field-type map (\`{ id: 'string', ... }\`) or an object literal of scalar validators (\`z.object({ id: z.string() })\`) lower. A schema held in a variable, \`v.pipe(…)\` and ArkType fall through to tier2 silent-drop.`,
    )
    return undefined
  }

  // A validator-object schema ALSO lowers to the schema struct `@pyreon/validation` emits for `zodSchema(z.object({…}))`, under the
  // name `<binding>_schema`, so `<binding>.schema.safeParse(x)` enforces on device what the web enforces. The one-declarator
  // recognizer reads a declaration, so the `z.object(…)` call rides a synthesized one; `inline` keeps the struct from also
  // claiming a value binding of its own (`Todo.schema` is not a value on native).
  let schemaItem: ExtItemSpec | undefined
  if (validators !== undefined && schemaNode !== undefined) {
    const namespace = unwrapTypeLayers(schemaNode.callee.object as AnyNode)?.name as string | undefined
    const built =
      namespace === undefined
        ? null
        : tryNamespacedSchemaDefnFromTopLevel(
            {
              type: 'VariableDeclaration',
              kind: 'const',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: schemaStructName(bindingName) },
                  init: schemaNode,
                },
              ],
            },
            ctx,
            null,
            namespace,
            'zod',
          )
    if (built !== null) {
      built.inline = true
      schemaItem = schemaItemSpec(built)
      ctx.addItem(schemaItem)
    }
  }

  const fields: FeaturePayload['fields'] = []
  for (const entry of (fieldMap.properties as AnyNode[] | undefined) ?? []) {
    if (entry?.type !== 'Property' && entry?.type !== 'ObjectProperty') continue
    if (hasDynamicKey(entry)) {
      ctx.warnDynamicKey(entry, `defineFeature declaration \`${bindingName}\`: schema`)
      continue
    }
    const fieldName = staticPropKey(entry)
    if (!fieldName) continue
    const eVal = unwrapTypeLayers(entry.value as AnyNode | undefined)
    if (validators !== undefined) {
      const scalar = scalarValidator(eVal)
      if (scalar === null) {
        ctx.report(
          `defineFeature declaration \`${bindingName}\`: schema field \`${fieldName}\` is not a scalar validator (\`z.string()\` / \`z.number()\` / \`z.boolean()\`) — only those lower. Dropping field.`,
        )
        continue
      }
      // The schema struct built below carries the constraints (and names what it cannot), so the declaration warns only when
      // no schema could be built.
      const dropped = schemaItem === undefined ? scalar.chain.filter((method) => !CARRIED.has(method)) : []
      if (dropped.length > 0) {
        const chained = dropped.map((method) => `.${method}()`).join('')
        ctx.report(
          `defineFeature declaration \`${bindingName}\`: schema field \`${fieldName}\` chains \`${chained}\` — the native declaration carries the field's TYPE only, so those constraints are NOT enforced on device (the web validates them). Validate natively with \`@pyreon/validate\` or in the handler.`,
        )
      }
      fields.push({ name: fieldName, type: scalar.type })
      continue
    }
    if (eVal?.type !== 'Literal' || typeof eVal.value !== 'string') {
      ctx.report(
        `defineFeature declaration \`${bindingName}\`: schema field \`${fieldName}\` is not a type-name string literal — v1 supports 'string' | 'number' | 'boolean' field types. Dropping field.`,
      )
      continue
    }
    const typeName = eVal.value
    if (typeName === 'string' || typeName === 'number' || typeName === 'boolean') {
      fields.push({ name: fieldName, type: typeName })
    } else {
      ctx.report(
        `defineFeature declaration \`${bindingName}\`: schema field \`${fieldName}\` has unsupported type '${typeName}' — v1 supports 'string' | 'number' | 'boolean'. Dropping field.`,
      )
    }
  }

  if (fields.length === 0) {
    ctx.report(`defineFeature declaration \`${bindingName}\`: no recognized schema fields. Falling back to tier2 silent-drop.`)
    return undefined
  }
  return { type: ITEM_TYPE, name: bindingName, payload: { bindingName, featureName, fields } }
}

const featureItem: ModuleItemEmitter = {
  // The feature declarations emit before every schema / field-metadata item, where the core's own list used to.
  after: 'declarations',
  // The item was a closed `features` array before it moved here; the hash that names synthesized structs reads it there.
  legacyList: 'features',
  // The binding is a VALUE in the file's one namespace, so a same-named type renames it (`TodoValue`).
  bindings: {
    names: (item) => [item.name],
    rename(item, renames) {
      const to = renames.get(item.name)
      if (to !== undefined) {
        item.name = to
        payloadOf(item).bindingName = to
      }
    },
  },
  swift(item) {
    const f = payloadOf(item)
    const lines: string[] = []
    lines.push(`struct PyreonFeatureSchema_${f.bindingName}: Codable {`)
    for (const field of f.fields) {
      const t = field.type === 'string' ? 'String' : field.type === 'number' ? 'Int' : 'Bool'
      const initial = field.type === 'string' ? '""' : field.type === 'boolean' ? 'false' : '0'
      lines.push(`    var ${swiftIdent(field.name)}: ${t} = ${initial}`)
    }
    lines.push(...swiftCodingKeysLines(f.fields.map((x) => x.name), '    '))
    lines.push(`}`)
    lines.push(``)
    lines.push(`enum PyreonFeature_${f.bindingName} {`)
    lines.push(`    static let name = ${swiftStr(f.featureName)}`)
    lines.push(`    static let initialValues = PyreonFeatureSchema_${f.bindingName}()`)
    lines.push(`}`)
    // The binding the SOURCE names. Without it the declaration is unreachable: shared source writes `Todo.name`, the emit declares
    // `PyreonFeature_Todo`, and the compiler fails with "cannot find 'Todo' in scope" on a file the author never wrote. A VALUE
    // binding (`.self`, a metatype) rather than a `typealias`; it is NOT collision-proof — Swift and Kotlin share one namespace
    // for types and values, so a same-named user type collides with either form, which the compiler's value/type
    // disambiguation renames.
    lines.push(``)
    lines.push(`let ${f.bindingName} = PyreonFeature_${f.bindingName}.self`)
    return [lines.join('\n')]
  },
  kotlin(item) {
    const f = payloadOf(item)
    const lines: string[] = []
    lines.push(`data class PyreonFeatureSchema_${f.bindingName}(`)
    for (const field of f.fields) {
      const t = field.type === 'string' ? 'String' : field.type === 'number' ? KOTLIN_INT : 'Boolean'
      const initial = field.type === 'string' ? '""' : field.type === 'boolean' ? 'false' : '0'
      lines.push(`    var ${kotlinMember(field.name)}: ${t} = ${initial},`)
    }
    lines.push(`)`)
    lines.push(``)
    lines.push(`object PyreonFeature_${f.bindingName} {`)
    lines.push(`    const val name = ${kotlinStr(f.featureName)}`)
    lines.push(`    val initialValues = PyreonFeatureSchema_${f.bindingName}()`)
    lines.push(`}`)
    lines.push(``)
    lines.push(`val ${f.bindingName} = PyreonFeature_${f.bindingName}`)
    return [lines.join('\n')]
  },
}

/** The `@pyreon/feature` native plugin — discovered from the package manifest when a source imports it. */
export const featurePlugin: CompilerPlugin = Object.freeze({
  name: FEATURE_PLUGIN_NAME,
  apiVersion: 2,
  modules: Object.freeze([FEATURE_PLUGIN_NAME]),
  topLevel: recognizeFeature,
  items: Object.freeze({ [ITEM_TYPE]: featureItem, [SCHEMA_ITEM_TYPE]: createSchemaItem() }),
  scanModule: scanFeatures,
  methodCalls: Object.freeze({ '*': recognizeFeatureSchemaCall }),
  exprs: Object.freeze({ safeParse: safeParseExpr }),
  refineStructs: createSchemaStructRefinement(FEATURE_PLUGIN_NAME),
  finishModule: finishFeature,
  // A `defineFeature` call the top-level recognizer did not lower (a call inside a component body, a destructured binding, a
  // non-literal schema) would emit as an unresolved reference: the compiler's standing Tier-2 diagnostic names this package.
  tier2Calls: Object.freeze(['defineFeature']),
})
