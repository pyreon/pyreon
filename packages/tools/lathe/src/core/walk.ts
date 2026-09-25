/**
 * The direct children of an IR type.
 *
 * ONE exhaustive definition, used by every walker that only needs to reach
 * nested types (dependency collection, ref collection). Each of those used to
 * carry its own `switch` over the kinds, and adding the `nullable` kind showed
 * what that costs: the model dependency walk did not descend into it, so a
 * model referenced only through a nullable field was emitted BEFORE its
 * dependency and the generated module threw `Cannot access 'X' before
 * initialization` at import -- on Twilio, OpenAI and DigitalOcean at once.
 * The `never` check below makes a new kind a compile error here instead.
 */
import type { IrOperation, IrType } from './ir'

export function childTypes(type: IrType): readonly IrType[] {
  switch (type.kind) {
    case 'array':
      return [type.items]
    case 'nullable':
      return [type.inner]
    case 'union':
      return type.options
    case 'object':
      return type.additional ? [...type.fields.map((f) => f.type), type.additional] : type.fields.map((f) => f.type)
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'enum':
    case 'unknown':
    case 'ref':
      return []
    default: {
      const exhaustive: never = type
      return exhaustive
    }
  }
}

/** Every model name `type` references, at any depth (refs are not followed). */
export function collectRefNames(type: IrType | undefined, into: Set<string>): void {
  if (!type) return
  if (type.kind === 'ref') {
    into.add(type.name)
    return
  }
  for (const c of childTypes(type)) collectRefNames(c, into)
}

/** Every type an operation carries directly: parameters, body, response. */
export function operationTypes(op: IrOperation): IrType[] {
  const out = [...op.pathParams, ...op.queryParams, ...op.headerParams, ...op.cookieParams].map((p) => p.type)
  if (op.body) out.push(op.body.type)
  if (op.response) out.push(op.response)
  return out
}

/**
 * Rebuild a type with every `ref` renamed through `rename`. Structural
 * sharing is not attempted: this runs once per model rename, never per emit.
 */
export function renameRefs(type: IrType, rename: (name: string) => string): IrType {
  switch (type.kind) {
    case 'ref':
      return { kind: 'ref', name: rename(type.name) }
    case 'array':
      return { ...type, items: renameRefs(type.items, rename) }
    case 'nullable':
      return { kind: 'nullable', inner: renameRefs(type.inner, rename) }
    case 'union':
      return { ...type, options: type.options.map((o) => renameRefs(o, rename)) }
    case 'object':
      return {
        ...type,
        fields: type.fields.map((f) => ({ ...f, type: renameRefs(f.type, rename) })),
        ...(type.additional ? { additional: renameRefs(type.additional, rename) } : {}),
      }
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
    case 'enum':
    case 'unknown':
      return type
    default: {
      const exhaustive: never = type
      return exhaustive
    }
  }
}
