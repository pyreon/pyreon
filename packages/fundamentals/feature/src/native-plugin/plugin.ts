// How `@pyreon/feature` crosses to native: `const Todo = defineFeature({ name: 'todo', schema: { id: 'string', … } })`
// lowers to a schema struct plus a module-scope binding exposing `name` and `initialValues`.
//
//   Swift   → `struct PyreonFeatureSchema_Todo: Codable`, `enum PyreonFeature_Todo`, `let Todo = PyreonFeature_Todo.self`
//   Kotlin  → `data class PyreonFeatureSchema_Todo`, `object PyreonFeature_Todo`, `val Todo = PyreonFeature_Todo`
//
// Two schema shapes lower: the LITERAL map (`{ field: 'string' | 'number' | 'boolean' }`) and an object LITERAL of scalar
// validators (`z.object({ id: z.string(), done: z.boolean() })`, the same shape under another namespace). A scalar field
// reads through its modifier chain; any chain method the declaration half cannot carry (`.min()`, `.email()`,
// `.optional()`, …) is reported BY NAME, because the emitted struct holds the field's type and nothing else. A
// non-literal schema (a variable, `v.pipe(…)`, ArkType), a non-literal name and the CRUD runtime (`useList`,
// `useById`, …) fall to the Tier-2 diagnostic.

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
  type ModuleItemEmitter,
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
      const dropped = scalar.chain.filter((method) => !CARRIED.has(method))
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
  items: Object.freeze({ [ITEM_TYPE]: featureItem }),
  // A `defineFeature` call the top-level recognizer did not lower (a call inside a component body, a destructured binding, a
  // non-literal schema) would emit as an unresolved reference: the compiler's standing Tier-2 diagnostic names this package.
  tier2Calls: Object.freeze(['defineFeature']),
})
