// The schema item every schema-lowering plugin shares.
//
// `@pyreon/validation` (zod / valibot / arktype adapters) and `@pyreon/validate` (the `s` DSL) lower to the SAME
// native struct, so the model, its emitters, its name handling, the per-field validators a native form reads
// and the response-type evidence an endpoint reads live here, once. Each plugin registers `createSchemaItem()`
// under its OWN name: the compiler dispatches an item by `(plugin, type)`, so an app that declares only one of
// the two packages loads a plugin that is self-sufficient, and an app that declares both never collides.

import type {
  ExtItemSpec,
  ExtModuleItem,
  ItemBindings,
  ModuleItemEmitter,
  StructIR,
  StructRefinement,
  TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { swiftStr, kotlinStr } from '@pyreon/native-compiler/plugin-api'
import type { ZodSchemaDefnIR } from './ir'
import { emitKotlinSchemaTree } from './kotlin'
import { emitSwiftSchemaTree } from './swift'

/** The item `type` of a lowered schema. */
export const SCHEMA_ITEM_TYPE = 'schema'

/** The schema an item carries. */
export const schemaOf = (item: ExtModuleItem): ZodSchemaDefnIR => item.payload as unknown as ZodSchemaDefnIR

/** The item spec for a recognized schema (the payload IS the model, key order included — it is hashed). */
export function schemaItemSpec(zs: ZodSchemaDefnIR): ExtItemSpec {
  return { type: SCHEMA_ITEM_TYPE, name: zs.bindingName, payload: zs as unknown as ExtItemSpec['payload'] }
}

/** Every auxiliary schema of `defs`, at any depth. */
const auxOf = (defs: readonly ZodSchemaDefnIR[] | undefined): ZodSchemaDefnIR[] =>
  (defs ?? []).flatMap((a) => [a, ...auxOf(a.auxSchemas)])

/** Rewrite every by-name schema link in a payload (field types, array elements, discriminator variants). */
function renameLinks(node: unknown, renames: ReadonlyMap<string, string>): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const el of node) renameLinks(el, renames)
    return
  }
  const rec = node as Record<string, unknown>
  if (typeof rec.schemaName === 'string') {
    const to = renames.get(rec.schemaName)
    if (to !== undefined) rec.schemaName = to
  }
  for (const v of Object.values(rec)) renameLinks(v, renames)
}

/**
 * A renamed schema's NESTED schemas follow it. `s.object({ author: s.object({…}) })` synthesizes an auxiliary
 * schema named after its parent (`Book_Author`), so without this the parent became `BookValue` while its
 * children kept `Book_…` — consistent, compiling, and needlessly confusing. Only an aux name that still carries
 * the parent's prefix is renamed, and only onto a name nothing else took.
 */
const bindings: ItemBindings = {
  names: (item) => [item.name],
  reserved: (item) => auxOf(schemaOf(item).auxSchemas).map((a) => a.bindingName),
  rename(item, renames, taken) {
    const zs = schemaOf(item)
    const to = renames.get(zs.bindingName)
    if (to !== undefined) {
      const prefix = `${zs.bindingName}_`
      for (const aux of auxOf(zs.auxSchemas)) {
        if (!aux.bindingName.startsWith(prefix) || renames.has(aux.bindingName)) continue
        const candidate = `${to}_${aux.bindingName.slice(prefix.length)}`
        if (taken.has(candidate)) continue
        taken.add(candidate)
        renames.set(aux.bindingName, candidate)
      }
    }
    zs.bindingName = renames.get(zs.bindingName) ?? zs.bindingName
    item.name = zs.bindingName
    for (const aux of auxOf(zs.auxSchemas)) aux.bindingName = renames.get(aux.bindingName) ?? aux.bindingName
    renameLinks(zs, renames)
  },
}

/**
 * The emitters, hash lane, name handling and form validators of a `schema` item.
 *
 * `declaredBy` is what the compiler's "no declaration by that name" warning names as the way to declare a
 * schema a form can validate against (`zodSchema/valibotSchema/arkTypeSchema`); only the plugin that owns
 * those names supplies it.
 */
export function createSchemaItem(options: { readonly declaredBy?: string } = {}): ModuleItemEmitter {
  return {
    legacyList: 'zodSchemas',
    bindings,
    fieldValidators: {
      ...(options.declaredBy !== undefined ? { declaredBy: options.declaredBy } : {}),
      // A form Field is a text input, so only STRING fields are validated.
      fields: (item) => schemaOf(item).fields.filter((f) => f.type === 'string').map((f) => f.name),
      swift: (item, field, value) => `PyreonZodSchema_${item.name}.validateField(${swiftStr(field)}, ${value})`,
      kotlin: (item, field, value) => `PyreonZodSchema_${item.name}.validateField(${kotlinStr(field)}, ${value})`,
    },
    swift: (item) => emitSwiftSchemaTree(schemaOf(item)),
    kotlin: (item) => emitKotlinSchemaTree(schemaOf(item)),
  }
}

/**
 * Type a DECODE struct's `number` fields Double when the endpoint's response schema says the wire value may be
 * fractional.
 *
 * A TS `number` carries no int/float distinction, so PMTC defaults it to Int. For a model that is DECODED from a
 * response, that default is wrong whenever the value can be fractional: `JSONDecoder` / kotlinx reject `1.5` for
 * an `Int`, so the native app fails to decode a payload the web parses. The endpoint's `response` schema is where
 * the distinction lives — `s.number()` accepts a fraction, `s.number().int()` does not — so a decode site
 * (`useQuery<Book>(() => getBook.query())`, `useFetch<Book>(getBook())`) over
 * `api.endpoint('GET /books/:id', { response: book_schema })` refines `Book`'s matching fields from
 * `book_schema`'s. Nested objects and arrays of objects recurse through the schema's aux schemas.
 *
 * Strictly ADDITIVE: only `number` → `number & float`, only on a schema field without `.int()`. An `.int()`
 * field — and every struct with no schema evidence — keeps the Int default.
 *
 * `owner` is the plugin whose items are evidence: each loaded schema plugin refines from its own.
 */
export function createSchemaStructRefinement(owner: string): StructRefinement {
  return ({ structs, items, decodes }) => {
    if (structs.length === 0 || decodes.length === 0) return
    const structByName = new Map(structs.map((st) => [st.name, st]))
    const schemaByName = new Map<string, ZodSchemaDefnIR>()
    const index = (sc: ZodSchemaDefnIR): void => {
      schemaByName.set(sc.bindingName, sc)
      for (const aux of sc.auxSchemas ?? []) index(aux)
    }
    for (const item of items) if (item.plugin === owner && item.type === SCHEMA_ITEM_TYPE) index(schemaOf(item))
    const seen = new Set<string>()

    const floatNumber = (t: TypeIR): TypeIR => {
      if (t.kind === 'number') return t.float === true ? t : { kind: 'number', float: true }
      if (t.kind === 'union') return { ...t, branches: t.branches.map(floatNumber) }
      return t
    }
    const floatElement = (t: TypeIR): TypeIR => {
      if (t.kind === 'array') return { ...t, element: floatNumber(t.element) }
      if (t.kind === 'union') return { ...t, branches: t.branches.map(floatElement) }
      return t
    }
    const structOf = (t: TypeIR): StructIR | undefined => {
      if (t.kind === 'typeRef') return structByName.get(t.name)
      if (t.kind === 'array') return structOf(t.element)
      if (t.kind === 'union') {
        for (const b of t.branches) {
          const found = structOf(b)
          if (found) return found
        }
      }
      return undefined
    }
    const refine = (struct: StructIR, schema: ZodSchemaDefnIR): void => {
      const key = `${struct.name}<-${schema.bindingName}`
      if (seen.has(key)) return
      seen.add(key)
      for (const sf of schema.fields) {
        const field = struct.fields.find((f) => f.name === sf.name)
        if (!field) continue
        const t = sf.type
        if (t === 'number') {
          if (sf.integer !== true) field.type = floatNumber(field.type)
        } else if (typeof t === 'object' && t.kind === 'array') {
          if (t.element === 'number') {
            if (t.elementInteger !== true) field.type = floatElement(field.type)
          } else if (typeof t.element === 'object') {
            const nested = structOf(field.type)
            const nestedSchema = schemaByName.get(t.element.schemaName)
            if (nested && nestedSchema) refine(nested, nestedSchema)
          }
        } else if (typeof t === 'object' && t.kind === 'object') {
          const nested = structOf(field.type)
          const nestedSchema = schemaByName.get(t.schemaName)
          if (nested && nestedSchema) refine(nested, nestedSchema)
        }
      }
    }

    for (const decode of decodes) {
      const ref = decode.response
      if (!ref) continue
      const schema = schemaByName.get(ref.binding)
      const struct = structOf(decode.type)
      if (schema && struct) refine(struct, schema)
    }
  }
}
