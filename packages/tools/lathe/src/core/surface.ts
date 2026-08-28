/**
 * The API SURFACE — a compact, comparable description of what a generated
 * client depends on, and the semantic diff over two of them.
 *
 * ## Why this exists
 *
 * A spec edit is the one change in this pipeline that can break an app without
 * breaking a build. Regenerate after a field is deleted and everything still
 * typechecks — against the NEW types, which agree with the new spec and with
 * nothing the app was written for. The failure shows up at runtime, in the
 * shape of a value that is suddenly `undefined`.
 *
 * `check-lathe-fresh` catches a spec edit with NO regeneration. This catches
 * the opposite and more dangerous case: a regeneration that quietly changed
 * the contract.
 *
 * ## Why a separate surface rather than diffing the generated code
 *
 * Generated TypeScript carries formatting, ordering, doc comments and import
 * lists that move for reasons that are not contract changes — so a textual
 * diff reports noise and, worse, hides a real change inside it. The surface
 * holds ONLY what a caller can observe: which operations exist, what they take,
 * and what they return.
 *
 * ## What counts as breaking, and for whom
 *
 * Always from the CLIENT's point of view, which is not symmetric with the
 * server's:
 *
 *   - A response field REMOVED is breaking — the app reads it.
 *   - A response field ADDED is additive — nobody was reading it.
 *   - A response field becoming OPTIONAL is breaking: the app was entitled to
 *     assume presence, and the value is now sometimes missing.
 *   - A REQUEST field becoming REQUIRED is breaking — existing calls omit it.
 *   - A request field ADDED as optional is additive.
 *   - A type change on either side is breaking.
 *   - An operation removed, or its method/path moved, is breaking.
 *
 * That asymmetry is the whole reason this is a hand-written classifier and not
 * a structural deep-equal: a deep-equal reports every difference with equal
 * weight, which is the same as reporting none.
 */
import type { IrDocument, IrField, IrOperation, IrType } from './ir'

/** One operation's observable contract. */
export interface SurfaceOperation {
  id: string
  method: string
  path: string
  /** `name` → rendered type, for path + query params. Required is marked. */
  params: Record<string, string>
  requiredParams: string[]
  body?: string | undefined
  response?: string | undefined
}

/** The comparable surface of a whole document. */
export interface ApiSurface {
  /** Bumped when the RENDERING below changes shape, so a stale baseline is
   *  reported as such rather than diffed as a thousand changes. */
  version: 1
  title: string
  operations: Record<string, SurfaceOperation>
  /** Model name → field name → rendered type, with `?` marking optional. */
  models: Record<string, Record<string, string>>
}

/**
 * Render a type to a stable string.
 *
 * A STRING rather than a nested structure because the comparison is equality
 * and the output is a diff line a human reads. `depth` guards a self-recursive
 * model (`Node { children: Node[] }`), which `ref` closes in the IR but which
 * a nested inline object could still make deep.
 */
export function renderType(type: IrType | undefined, depth = 0): string {
  if (!type) return 'void'
  if (depth > 6) return '…'
  switch (type.kind) {
    case 'string':
      return type.enum ? `enum(${[...type.enum].sort().join('|')})` : type.format ?? 'string'
    case 'number':
      return type.integer ? 'integer' : 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'unknown':
      return 'unknown'
    case 'array':
      return `${renderType(type.items, depth + 1)}[]`
    case 'ref':
      return type.name
    case 'union':
      // SORTED: a spec reordering its `oneOf` is not a contract change, and a
      // diff that says otherwise trains people to ignore it.
      return [...type.options.map((o) => renderType(o, depth + 1))].sort().join(' | ')
    case 'object': {
      const fields = [...type.fields]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => `${f.name}${f.required ? '' : '?'}: ${renderType(f.type, depth + 1)}`)
      return `{ ${fields.join('; ')} }`
    }
  }
}

function fieldsOf(type: IrType | undefined): readonly IrField[] {
  return type?.kind === 'object' ? type.fields : []
}

/** Extract the comparable surface from a parsed document. */
export function extractSurface(doc: IrDocument): ApiSurface {
  const operations: Record<string, SurfaceOperation> = {}
  for (const op of [...doc.operations].sort((a, b) => a.id.localeCompare(b.id))) {
    operations[op.id] = surfaceOf(op)
  }
  const models: Record<string, Record<string, string>> = {}
  for (const m of [...doc.models].sort((a, b) => a.name.localeCompare(b.name))) {
    const fields: Record<string, string> = {}
    for (const f of [...fieldsOf(m.type)].sort((a, b) => a.name.localeCompare(b.name))) {
      fields[f.name] = `${renderType(f.type)}${f.required ? '' : ' (optional)'}`
    }
    models[m.name] = fields
  }
  return { version: 1, title: doc.title, operations, models }
}

function surfaceOf(op: IrOperation): SurfaceOperation {
  const params: Record<string, string> = {}
  const requiredParams: string[] = []
  for (const p of [...op.pathParams, ...op.queryParams].sort((a, b) => a.name.localeCompare(b.name))) {
    params[p.name] = renderType(p.type)
    // A PATH param is required by construction — a URL cannot omit a segment —
    // whatever the spec marked it.
    if (p.required || op.pathParams.includes(p)) requiredParams.push(p.name)
  }
  const out: SurfaceOperation = { id: op.id, method: op.method, path: op.path, params, requiredParams }
  if (op.body !== undefined) out.body = renderType(op.body)
  if (op.response !== undefined) out.response = renderType(op.response)
  return out
}

/** One classified difference between two surfaces. */
export interface SurfaceChange {
  /** `breaking` = existing correct app code can now be wrong at runtime. */
  severity: 'breaking' | 'additive'
  /** A stable, greppable class — the thing an agent or a script branches on. */
  code:
    | 'operation-removed'
    | 'operation-moved'
    | 'operation-added'
    | 'param-now-required'
    | 'param-type-changed'
    | 'param-removed'
    | 'param-added'
    | 'body-changed'
    | 'response-changed'
    | 'model-removed'
    | 'model-added'
    | 'field-removed'
    | 'field-type-changed'
    | 'field-now-optional'
    | 'field-added'
  /** What moved — an operation id or `Model.field`. */
  subject: string
  detail: string
}

/**
 * Compare two surfaces from the CLIENT's point of view.
 *
 * Returns every difference, classified. A caller decides what to do with them;
 * this does not decide for it, because "fail on breaking" is right in CI and
 * wrong on a feature branch where the spec is deliberately moving.
 */
export function diffSurface(before: ApiSurface, after: ApiSurface): SurfaceChange[] {
  const changes: SurfaceChange[] = []
  const add = (
    severity: SurfaceChange['severity'],
    code: SurfaceChange['code'],
    subject: string,
    detail: string,
  ): void => {
    changes.push({ severity, code, subject, detail })
  }

  for (const [id, was] of Object.entries(before.operations)) {
    const now = after.operations[id]
    if (!now) {
      add('breaking', 'operation-removed', id, `\`${was.method} ${was.path}\` no longer exists`)
      continue
    }
    if (was.method !== now.method || was.path !== now.path) {
      add('breaking', 'operation-moved', id, `\`${was.method} ${was.path}\` → \`${now.method} ${now.path}\``)
    }
    for (const [name, type] of Object.entries(was.params)) {
      const nowType = now.params[name]
      if (nowType === undefined) {
        // Dropping a parameter the client SENDS does not break the client:
        // the request still goes out, the server ignores it.
        add('additive', 'param-removed', `${id}.${name}`, 'parameter no longer accepted')
      } else if (nowType !== type) {
        add('breaking', 'param-type-changed', `${id}.${name}`, `${type} → ${nowType}`)
      }
    }
    for (const name of Object.keys(now.params)) {
      if (was.params[name] !== undefined) continue
      const required = now.requiredParams.includes(name)
      if (required) {
        add('breaking', 'param-now-required', `${id}.${name}`, 'new REQUIRED parameter; existing calls omit it')
      } else {
        add('additive', 'param-added', `${id}.${name}`, 'new optional parameter')
      }
    }
    for (const name of now.requiredParams) {
      if (!was.requiredParams.includes(name) && was.params[name] !== undefined) {
        add('breaking', 'param-now-required', `${id}.${name}`, 'optional → required')
      }
    }
    if (was.body !== now.body) {
      add('breaking', 'body-changed', id, `request body ${was.body ?? 'none'} → ${now.body ?? 'none'}`)
    }
    if (was.response !== now.response) {
      add('breaking', 'response-changed', id, `response ${was.response ?? 'none'} → ${now.response ?? 'none'}`)
    }
  }
  for (const id of Object.keys(after.operations)) {
    if (before.operations[id] === undefined) {
      const now = after.operations[id] as SurfaceOperation
      add('additive', 'operation-added', id, `\`${now.method} ${now.path}\``)
    }
  }

  for (const [name, was] of Object.entries(before.models)) {
    const now = after.models[name]
    if (!now) {
      add('breaking', 'model-removed', name, 'model no longer exists')
      continue
    }
    for (const [field, type] of Object.entries(was)) {
      const nowType = now[field]
      if (nowType === undefined) {
        add('breaking', 'field-removed', `${name}.${field}`, `was ${type}`)
      } else if (nowType !== type) {
        const wasOptional = type.endsWith('(optional)')
        const isOptional = nowType.endsWith('(optional)')
        if (!wasOptional && isOptional) {
          // The subtle one. The app reads the field unconditionally today and
          // keeps typechecking against the regenerated optional type only
          // because it never asks; at runtime it is now sometimes absent.
          add('breaking', 'field-now-optional', `${name}.${field}`, 'required → optional')
        } else {
          add('breaking', 'field-type-changed', `${name}.${field}`, `${type} → ${nowType}`)
        }
      }
    }
    for (const field of Object.keys(now)) {
      if (was[field] === undefined) add('additive', 'field-added', `${name}.${field}`, now[field] as string)
    }
  }
  for (const name of Object.keys(after.models)) {
    if (before.models[name] === undefined) add('additive', 'model-added', name, 'new model')
  }

  // Breaking first, then by subject — the order someone reads it in.
  return changes.sort((a, b) =>
    a.severity === b.severity ? a.subject.localeCompare(b.subject) : a.severity === 'breaking' ? -1 : 1,
  )
}
