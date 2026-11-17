/**
 * Name every inline object type that sits OUTSIDE every component.
 *
 * Inside a component an inline object type (`signal<{ ok: boolean }>`, `JSON.parse(s) as { … }`, a local's
 * annotation) is synthesized by the emitters as a struct named after that component. At module scope there is no
 * component to name it after, and the two targets fell apart on one line of shared source: Swift spelled a
 * multi-field shape as a labelled tuple (right members, NOT `Codable`, so decoding into it fails, and a tuple
 * annotation over a struct literal does not even typecheck) with no warning, and Kotlin spelled it `Any`.
 *
 * Every module-scope position is lifted here, once, before either emitter runs, into a declared struct named after
 * the binding that owns it — `const config: { host: string }` declares `ConfigType`, a helper's parameter
 * `fmt(p: { … })` declares `FmtPType`, its return `MkResult` — so both targets read ONE named `Codable` struct /
 * `@Serializable` data class, object literals of that shape construct it, and the float refinements see it like any
 * declared struct. Array / optional / `Readonly` wrappers are transparent (`rows: { … }[]` declares `RowsType`); a
 * nested object field is named after its parent (`ConfigType` + `tls` → `ConfigTypeTls`).
 *
 * A shape the file already declares (an `interface`, a `type`, an earlier lift) IS that type — the same rule the
 * emitters apply — so one value never gets two nominal types. A generated name that is already taken gets a numeric
 * suffix (`ConfigType2`); unlike the struct-field lifter this pass runs once, so no other pass has to predict it.
 */
import { exprContainsJsx, structShapeKey } from './expr-utils'
import type { DeclIR, ExprIR, ModuleDeclIR, StructIR, TypeIR } from './types'

type ObjectType = Extract<TypeIR, { kind: 'object' }>
type HelperFn = Extract<DeclIR, { kind: 'function' }>

const TYPE_KINDS = new Set([
  'number',
  'string',
  'boolean',
  'array',
  'map',
  'set',
  'object',
  'null',
  'undefined',
  'union',
  'typeRef',
  'function',
  'unknown',
])

/** IR properties that hold a `TypeIR` (statement / expression annotations, decode targets, collection types). */
const TYPE_KEYS = new Set([
  'type',
  'declaredType',
  'returnType',
  'returnAnnot',
  'keyType',
  'valueType',
  'elementType',
])

function pascal(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

function isTypeIR(v: unknown): v is TypeIR {
  if (v === null || typeof v !== 'object') return false
  const kind = (v as { kind?: unknown }).kind
  if (typeof kind !== 'string' || !TYPE_KINDS.has(kind)) return false
  // ExprIR shares `array` / `object` / `function`-ish kinds: a TYPE array has `element`, a TYPE object's fields carry `type`.
  if (kind === 'array') return 'element' in v
  if (kind === 'object') {
    const fields = (v as { fields?: unknown }).fields
    return (
      Array.isArray(fields) &&
      fields.every((f) => f !== null && typeof f === 'object' && 'type' in f)
    )
  }
  if (kind === 'function') return 'returnType' in v && !('body' in v)

  return true
}

export interface ModuleInlineTypeScope {
  moduleDecls: ModuleDeclIR[]
  helperFns: HelperFn[]
  structs: StructIR[]
  /** Every name the file already declares (types, enums, components, module values, helpers). */
  taken: ReadonlySet<string>
}

/**
 * Lift every module-scope inline object type into a declared struct, in place. Returns the new structs, nested ones
 * first so each is declared before its user.
 */
export function liftModuleInlineObjectTypes(scope: ModuleInlineTypeScope): StructIR[] {
  const taken = new Set(scope.taken)
  for (const st of scope.structs) taken.add(st.name)
  const byShape = new Map<string, string>()
  for (const st of scope.structs) {
    const key = structShapeKey(st.fields)
    if (!byShape.has(key)) byShape.set(key, st.name)
  }
  const lifted: StructIR[] = []
  const liftType = typeLifter(taken, byShape, lifted)
  const walk = annotationWalker(liftType)

  for (const md of scope.moduleDecls) {
    const base = pascal(md.name)
    md.type = liftType(md.type, `${base}Type`)
    walk(md.initial, base)
  }
  for (const fn of scope.helperFns) {
    const base = pascal(fn.name)
    for (const p of fn.params) {
      p.type = liftType(p.type, `${base}${pascal(p.name)}Type`)
      walk(p.defaultValue, base)
    }
    fn.returnType = liftType(fn.returnType, `${base}Result`)
    walk(fn.body, base)
  }

  return lifted
}

type LiftType = (t: TypeIR, name: string) => TypeIR

/**
 * Replace each inline object type under a type with a reference to a declared struct: an existing struct of the same
 * shape when there is one, otherwise a new one named `name` (made unique against `taken`) appended to `lifted`.
 */
function typeLifter(taken: Set<string>, byShape: Map<string, string>, lifted: StructIR[]): LiftType {
  const liftObject = (t: ObjectType, name: string): TypeIR => {
    // An empty object type has nothing to name; the emitters already give it `Any`.
    if (t.fields.length === 0) return t
    const fields = t.fields.map((f) => ({
      ...f,
      type: liftType(f.type, `${name}${pascal(f.name)}`),
    }))
    const key = structShapeKey(fields)
    const known = byShape.get(key)
    if (known !== undefined) return { kind: 'typeRef', name: known, args: [] }
    let unique = name
    for (let i = 2; taken.has(unique); i++) unique = `${name}${i}`
    taken.add(unique)
    byShape.set(key, unique)
    lifted.push({ name: unique, fields })

    return { kind: 'typeRef', name: unique, args: [] }
  }

  const liftType: LiftType = (t, name) => {
    switch (t.kind) {
      case 'object':
        return liftObject(t, name)
      case 'array':
        return { ...t, element: liftType(t.element, name) }
      case 'set':
        return { ...t, element: liftType(t.element, name) }
      case 'map':
        return { ...t, key: liftType(t.key, `${name}Key`), value: liftType(t.value, name) }
      case 'union':
        return { ...t, branches: t.branches.map((b) => liftType(b, name)) }
      case 'typeRef':
        return t.args.length === 0 ? t : { ...t, args: t.args.map((a) => liftType(a, name)) }
      case 'function':
        return {
          ...t,
          params: t.params.map((p, i) => ({
            ...p,
            type: liftType(p.type, `${name}${pascal(p.name ?? `arg${i}`)}`),
          })),
          returnType: liftType(t.returnType, `${name}Result`),
        }
      default:
        return t
    }
  }

  return liftType
}

/**
 * Rewrite every annotation inside an expression / statement tree. A node that binds a name (a local, a `const`)
 * names the types under it after itself; anything else inherits the owner's base.
 */
function annotationWalker(liftType: LiftType): (node: unknown, base: string) => void {
  const walkParams = (value: unknown[], local: string): void => {
    for (const p of value) {
      if (p !== null && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string') {
        const param = p as { name: string; type?: unknown; defaultValue?: unknown }
        if (isTypeIR(param.type)) {
          param.type = liftType(param.type, `${local}${pascal(param.name)}Type`)
        }
        walk(param.defaultValue, local)
      }
    }
  }

  const liftParamTypes = (rec: Record<string, unknown>, value: unknown[], local: string): unknown[] => {
    const params = Array.isArray(rec.params) ? (rec.params as unknown[]) : []

    return value.map((p, i) =>
      isTypeIR(p)
        ? liftType(p, `${local}${pascal(typeof params[i] === 'string' ? (params[i] as string) : `arg${i}`)}Type`)
        : p,
    )
  }

  const walk = (node: unknown, base: string): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const n of node) walk(n, base)

      return
    }
    const rec = node as Record<string, unknown>
    // A plugin's payload is its own JSON, not IR the core may rewrite.
    if (rec.kind === 'ext-expr' || rec.kind === 'ext') {
      walk(rec.args, base)

      return
    }
    // A JSX-returning arrow is a VIEW (a view helper, or a PascalCase component taking a props object), not data: an
    // inline object parameter is what marks it a component, which render-slots.ts classifies and names. Leave it.
    if (rec.kind === 'arrow' && exprContainsJsx(rec as unknown as ExprIR)) return
    const local = typeof rec.name === 'string' && typeof rec.kind === 'string' ? `${base}${pascal(rec.name)}` : base
    for (const [key, value] of Object.entries(rec)) {
      if (key !== 'payload') rewriteEntry(rec, key, value, local)
    }
  }

  const rewriteEntry = (rec: Record<string, unknown>, key: string, value: unknown, local: string): void => {
    if (TYPE_KEYS.has(key) && isTypeIR(value)) rec[key] = liftType(value, `${local}Type`)
    else if (key === 'paramTypes' && Array.isArray(value)) rec[key] = liftParamTypes(rec, value, local)
    else if (key === 'params' && Array.isArray(value)) walkParams(value, local)
    else if (value !== null && typeof value === 'object') walk(value, local)
  }

  return walk
}
