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
import type { IrDocument, IrOperation, IrType } from './ir'

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
    case 'bigint':
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
    case 'bigint':
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

/**
 * Every ROOT type a document carries: models, each operation's parameters,
 * body, response, error bodies and stream events, and webhook payloads.
 */
export function documentTypes(doc: IrDocument): IrType[] {
  const out: IrType[] = doc.models.map((m) => m.type)
  for (const op of doc.operations) {
    out.push(...operationTypes(op))
    for (const e of op.errors ?? []) out.push(e.type)
    if (op.stream) out.push(op.stream.event)
  }
  for (const w of doc.webhooks ?? []) if (w.payload) out.push(w.payload)
  return out
}

/** Visit `type` and every type nested in it (refs are not followed). */
export function visitTypes(type: IrType, visit: (t: IrType) => void): void {
  visit(type)
  for (const c of childTypes(type)) visitTypes(c, visit)
}

const bigintMemo = new WeakMap<IrDocument, boolean>()

/**
 * Does the document carry a `bigint` anywhere -- i.e. was it read under
 * `int64: 'bigint'` from a spec that has a `format: int64`?
 *
 * The one question every emitter asks before emitting the lossless JSON codec
 * and its `bigint`-aware helpers. `false` for every document read in the
 * default mode, which is what keeps that mode's output byte-identical.
 */
export function usesBigInt(doc: IrDocument): boolean {
  const hit = bigintMemo.get(doc)
  if (hit !== undefined) return hit
  let found = false
  for (const root of documentTypes(doc)) {
    visitTypes(root, (t) => {
      if (t.kind === 'bigint') found = true
    })
    if (found) break
  }
  bigintMemo.set(doc, found)
  return found
}

/**
 * `type` with every `bigint` read as the integer `number` it is on NATIVE.
 *
 * PMTC has no bigint, so a native module types an int64 the way the default
 * mode does. Returns the SAME object when nothing changes -- a document read
 * without `int64: 'bigint'` is never rebuilt.
 */
export function bigintAsNumber(type: IrType): IrType {
  switch (type.kind) {
    case 'bigint':
      return { kind: 'number', integer: true, minimum: type.minimum, maximum: type.maximum }
    case 'array': {
      const items = bigintAsNumber(type.items)
      return items === type.items ? type : { ...type, items }
    }
    case 'nullable': {
      const inner = bigintAsNumber(type.inner)
      return inner === type.inner ? type : { kind: 'nullable', inner }
    }
    case 'union': {
      const options = type.options.map(bigintAsNumber)
      return options.every((o, i) => o === type.options[i]) ? type : { ...type, options }
    }
    case 'object': {
      const fields = type.fields.map((f) => {
        const t = bigintAsNumber(f.type)
        return t === f.type ? f : { ...f, type: t }
      })
      const additional = type.additional ? bigintAsNumber(type.additional) : undefined
      return fields.every((f, i) => f === type.fields[i]) && additional === type.additional
        ? type
        : { ...type, fields, additional }
    }
    default:
      return type
  }
}
