/**
 * Request and response SHAPES of the same model: `readOnly` / `writeOnly`.
 *
 * A request body and a response usually `$ref` the same model, and that model
 * declares which fields travel in which direction. Ignoring the markers made
 * the server-assigned `readOnly` fields (`id`, `created_at`) REQUIRED in the
 * request type -- the caller had to invent them, and some servers reject a
 * body that carries them (DigitalOcean 242 such fields, GitHub 101) -- and made
 * a `writeOnly` required field (a password) required in the RESPONSE schema,
 * so every response failed validation.
 *
 * The model's own name keeps the RESPONSE shape (writeOnly fields removed),
 * because that is what a reader of the API receives and what every existing
 * reference already means. A model whose request shape differs gets a second
 * model, `<Name>Input`, with readOnly fields removed and writeOnly ones kept;
 * references inside it point at the other models' Input variants. Operations
 * then take the Input shape for bodies and parameters.
 *
 * Done once, on the IR, so no emitter needs to know the markers exist.
 */
import type { IrField, IrModel, IrOperation, IrType, IrWebhook } from '../core/ir'
import { childTypes, collectRefNames } from '../core/walk'

type Direction = 'request' | 'response'

/** Whether a type ITSELF (refs not followed) hides a field in `direction`. */
function hidesDirectly(type: IrType, direction: Direction): boolean {
  const stack: IrType[] = [type]
  while (stack.length > 0) {
    const t = stack.pop() as IrType
    if (t.kind === 'object' && t.fields.some((f) => hidden(f, direction))) return true
    stack.push(...childTypes(t))
  }
  return false
}

/**
 * Every model whose shape differs by direction, transitively: a model that
 * hides a field itself, or references one that does. Propagated backwards over
 * the reference graph with a worklist -- a per-model recursive walk was O(n²)
 * and blew the stack on a 2000-deep `$ref` chain.
 */
function differingModels(models: readonly IrModel[]): Set<string> {
  const dependents = new Map<string, string[]>()
  const out = new Set<string>()
  const work: string[] = []
  for (const m of models) {
    const refs = new Set<string>()
    collectRefNames(m.type, refs)
    for (const r of refs) {
      const list = dependents.get(r)
      if (list) list.push(m.name)
      else dependents.set(r, [m.name])
    }
    if (hidesDirectly(m.type, 'request') || hidesDirectly(m.type, 'response')) {
      out.add(m.name)
      work.push(m.name)
    }
  }
  while (work.length > 0) {
    const name = work.pop() as string
    for (const d of dependents.get(name) ?? []) {
      if (out.has(d)) continue
      out.add(d)
      work.push(d)
    }
  }
  return out
}

function hidden(f: IrField, direction: Direction): boolean {
  return direction === 'request' ? f.readOnly === true : f.writeOnly === true
}

/** Remove fields hidden in `direction`, and point refs at `rename(name)`. */
function project(type: IrType, direction: Direction, rename: (name: string) => string): IrType {
  switch (type.kind) {
    case 'ref':
      return { kind: 'ref', name: rename(type.name) }
    case 'array':
      return { ...type, items: project(type.items, direction, rename) }
    case 'nullable':
      return { kind: 'nullable', inner: project(type.inner, direction, rename) }
    case 'union':
      return { ...type, options: type.options.map((o) => project(o, direction, rename)) }
    case 'object':
      return {
        ...type,
        fields: type.fields
          .filter((f) => !hidden(f, direction))
          .map((f) => ({ ...f, type: project(f.type, direction, rename) })),
        additional: type.additional ? project(type.additional, direction, rename) : undefined,
      }
    default:
      return type
  }
}

/**
 * Split models by direction and rewrite operations to the right shape.
 *
 * `claimName` must return a name no model uses yet (it is the input layer's
 * collision-safe allocator). Mutates `models` and `operations` in place.
 */
export function splitByDirection(
  models: IrModel[],
  operations: IrOperation[],
  claimName: (base: string) => string,
  webhooks: IrWebhook[] = [],
): void {
  // A model needs an Input variant when its REQUEST shape is not its
  // RESPONSE shape: it (transitively) hides a field in either direction.
  const differ = differingModels(models)
  const inputName = new Map<string, string>()
  for (const m of models) if (differ.has(m.name)) inputName.set(m.name, claimName(`${m.name}Input`))
  if (inputName.size === 0 && !operations.some((op) => hasMarkers(op)) && webhooks.length === 0) return

  const toInput = (name: string): string => inputName.get(name) ?? name
  const same = (name: string): string => name
  const variants: IrModel[] = []
  for (const m of models) {
    const input = inputName.get(m.name)
    if (input) {
      variants.push({
        name: input,
        type: project(m.type, 'request', toInput),
        doc: m.doc ? `${m.doc}\n\nThe REQUEST shape: server-assigned (readOnly) fields removed.` : 'The REQUEST shape: server-assigned (readOnly) fields removed.',
      })
    }
    m.type = project(m.type, 'response', same)
  }
  models.push(...variants)

  for (const op of operations) {
    if (op.body) op.body = { ...op.body, type: project(op.body.type, 'request', toInput) }
    if (op.response) op.response = project(op.response, 'response', same)
    // An error body is a RESPONSE: server-assigned fields stay in it.
    if (op.errors) op.errors = op.errors.map((e) => ({ ...e, type: project(e.type, 'response', same) }))
    op.pathParams = op.pathParams.map((p) => ({ ...p, type: project(p.type, 'request', toInput) }))
    op.queryParams = op.queryParams.map((p) => ({ ...p, type: project(p.type, 'request', toInput) }))
    op.headerParams = op.headerParams.map((p) => ({ ...p, type: project(p.type, 'request', toInput) }))
    op.cookieParams = op.cookieParams.map((p) => ({ ...p, type: project(p.type, 'request', toInput) }))
  }
  // A webhook payload is SENT BY the API, like a response: server-assigned
  // fields are in it, client-only ones are not.
  for (const w of webhooks) if (w.payload) w.payload = project(w.payload, 'response', same)
}

/** Inline (non-model) readOnly / writeOnly fields in an operation. */
function hasMarkers(op: IrOperation): boolean {
  const any = (t: IrType | undefined): boolean =>
    !!t && ((t.kind === 'object' && t.fields.some((f) => f.readOnly || f.writeOnly)) || childTypes(t).some(any))
  return any(op.body?.type) || any(op.response) || (op.errors ?? []).some((e) => any(e.type))
}
