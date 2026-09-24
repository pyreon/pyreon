/**
 * Lift inline object types out of a struct's fields into their own named
 * structs.
 *
 * `interface Task { meta: { owner: string } }` has no native spelling for the
 * anonymous `{ owner: string }`. Left alone, Swift emits a labelled TUPLE (which
 * compiles, but is not `Codable`, so `PyreonJSON.encode`, a WebView `data=`
 * push or a Saver silently produce the wrong bytes) and Kotlin emits `Any`
 * (which does not compile the moment the body reads `task.meta.owner`). The two
 * targets fail differently from one line of shared source, and neither warns.
 *
 * The lift names each inline shape after its position — `Task.meta` becomes
 * `TaskMeta`, the element of `Task.tags: { name: string }[]` becomes
 * `TaskTagsItem` — and recurses, so a shape nested two deep gets
 * `TaskMetaOwner`. The name is a PURE function of the parent name and the field
 * path. That matters because two passes need it: struct synthesis (which
 * declares the lifted structs) and the props pre-pass (which types a component
 * whose props are `Task`). A counter or a collision suffix would let those two
 * disagree about what the same field is called.
 *
 * A generated name that is already declared in the file is NOT reused — reusing
 * it would silently retype the field as an unrelated user type. The field is
 * left as it was and a warning names the collision, so the author can rename.
 */
import type { StructIR, TypeIR } from './types'

type ObjectType = Extract<TypeIR, { kind: 'object' }>

function pascal(field: string): string {
  const parts = field.split(/[^A-Za-z0-9]+/).filter(Boolean)
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')
}

export interface InlineObjectLiftResult {
  /** The struct with every inline object field rewritten to a named reference. */
  struct: StructIR
  /** The lifted structs, innermost first, so each is declared before its user. */
  lifted: StructIR[]
  warnings: string[]
}

/**
 * Lift the inline object types in `struct`'s fields. `declared` is every type
 * name the file already declares (aliases, interfaces, enums) — a generated
 * name that collides with one is refused rather than reused.
 */
export function liftInlineObjectStructs(
  struct: StructIR,
  declared: ReadonlySet<string>,
): InlineObjectLiftResult {
  const lifted: StructIR[] = []
  const warnings: string[] = []
  const generated = new Set<string>()

  const liftType = (t: TypeIR, name: string, where: string): TypeIR => {
    switch (t.kind) {
      case 'object': {
        // An empty object type has nothing to name — leave it to the existing
        // untypeable-field diagnostics rather than declare a field-less struct.
        if (t.fields.length === 0) return t
        if (declared.has(name) || generated.has(name)) {
          warnings.push(
            `Struct ${struct.name}: the inline object type at \`${where}\` would lift to \`${name}\`, which is already declared — it stays anonymous, which is not Codable on Swift and does not compile on Kotlin. Give the shape its own name (\`type ${name}Shape = { … }\`) and reference it.`,
          )
          return t
        }
        generated.add(name)
        const fields = liftFields(t, name, where)
        lifted.push({ name, fields })
        return { kind: 'typeRef', name, args: [] }
      }
      case 'array':
        return { kind: 'array', element: liftType(t.element, `${name}Item`, `${where}[]`) }
      case 'set':
        return { kind: 'set', element: liftType(t.element, `${name}Item`, `${where}[]`) }
      case 'map':
        return { kind: 'map', key: t.key, value: liftType(t.value, `${name}Value`, `${where}{}`) }
      case 'union': {
        // `meta?: { … }` arrives as a union with `undefined`. Only a SINGLE
        // object branch can take the field's name; two object branches are a
        // structural union neither target has, so they are left alone.
        const objectBranches = t.branches.filter((b) => b.kind === 'object')
        if (objectBranches.length !== 1) return t
        return { kind: 'union', branches: t.branches.map((b) => liftType(b, name, where)) }
      }
      default:
        return t
    }
  }

  const liftFields = (obj: ObjectType, owner: string, where: string) =>
    obj.fields.map((f) => ({
      ...f,
      type: liftType(f.type, `${owner}${pascal(f.name)}`, `${where}.${f.name}`),
    }))

  const fields = liftFields({ kind: 'object', fields: struct.fields }, struct.name, struct.name)
  return { struct: { ...struct, fields }, lifted, warnings }
}

/**
 * Every type name a module declares at top level — the collision set for
 * {@link liftInlineObjectStructs}.
 */
export function collectDeclaredTypeNames(body: readonly { type: string; [k: string]: unknown }[]): Set<string> {
  const names = new Set<string>()
  for (const raw of body) {
    const node = (raw.type === 'ExportNamedDeclaration' ? raw.declaration : raw) as
      | { type?: string; id?: { name?: string } }
      | null
      | undefined
    if (!node) continue
    if (
      node.type === 'TSTypeAliasDeclaration' ||
      node.type === 'TSInterfaceDeclaration' ||
      node.type === 'TSEnumDeclaration' ||
      node.type === 'ClassDeclaration'
    ) {
      if (node.id?.name) names.add(node.id.name)
    }
  }
  return names
}
