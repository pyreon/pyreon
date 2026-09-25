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
import { reachableModels } from './graph'
import type { IrDocument, IrOperation, IrType } from './ir'
import { collectRefNames } from './walk'
import { byCodeUnit } from './order'

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
  /** `sse RoomEvent` / `ndjson { id: integer }` — what ONE streamed event carries. */
  stream?: string | undefined
  /**
   * Descriptive metadata — NOT part of the contract and never diffed. Here so a
   * reader of the surface (the MCP server, a docs tool) can say what an
   * operation is for and where its generated symbols live without re-reading
   * the spec.
   */
  /**
   * The generated module stem: this operation's endpoint is exported from
   * `endpoints/<module>.ts` and its hooks from `queries/<module>.ts`. Not the
   * spec tag verbatim — an untagged operation is grouped by path.
   */
  module?: string | undefined
  summary?: string | undefined
  /**
   * Generated symbols a caller imports for this operation, when the surface
   * was written by a generation run (`lathe generate`). The contract diff and
   * the MCP server name them so a reader knows which code to look at.
   */
  symbols?: readonly string[] | undefined
}

/** Where a model is reachable from: a request, a response, both, or neither. */
export type SurfaceUsage = 'request' | 'response' | 'both' | 'unused'

/** A model that is not an object with fields: an enum, a union, an array, … */
export interface SurfaceAlias {
  type: string
  /** The members of an enum / union (incl. `null`), for member-level diffs. */
  members?: string[] | undefined
}

/** The comparable surface of a whole document. */
export interface ApiSurface {
  /** Bumped when the RENDERING below changes shape, so a stale baseline is
   *  reported as such rather than diffed as a thousand changes. */
  version: 2
  title: string
  operations: Record<string, SurfaceOperation>
  /** Object model name → field name → rendered type, with `?` marking optional. */
  models: Record<string, Record<string, string>>
  /**
   * Every OTHER model (enum, union, array, scalar alias) → its rendering. They
   * used to be recorded as an empty field map, so an enum losing a value or a
   * union losing a member was invisible to the diff.
   */
  aliases: Record<string, SurfaceAlias>
  /**
   * Which direction each model travels in. A change that narrows a value is
   * breaking where the CLIENT sends it and harmless where it only receives it,
   * and the reverse -- the classifier cannot be right without this.
   */
  usage: Record<string, SurfaceUsage>
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
      return type.format ?? 'string'
    case 'enum':
      return `enum(${type.values.map((v) => JSON.stringify(v)).sort().join('|')})`
    case 'nullable':
      return `${renderType(type.inner, depth)} | null`
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
        .sort((a, b) => byCodeUnit(a.name, b.name))
        .map((f) => `${f.name}${f.required ? '' : '?'}: ${renderType(f.type, depth + 1)}`)
      return `{ ${fields.join('; ')} }`
    }
  }
}

/** The members of an enum or union, `null` included, or undefined. */
function membersOf(type: IrType): string[] | undefined {
  switch (type.kind) {
    case 'enum':
      return type.values.map((v) => JSON.stringify(v)).sort(byCodeUnit)
    case 'union':
      return type.options.map((o) => renderType(o)).sort(byCodeUnit)
    case 'nullable': {
      const inner = membersOf(type.inner) ?? [renderType(type.inner)]
      return [...inner, 'null'].sort(byCodeUnit)
    }
    default:
      return undefined
  }
}

/** Direction each model travels in, following references. */
function usageOf(doc: IrDocument): Record<string, SurfaceUsage> {
  const requestRoots = new Set<string>()
  const responseRoots = new Set<string>()
  for (const op of doc.operations) {
    collectRefNames(op.body?.type, requestRoots)
    for (const p of [...op.pathParams, ...op.queryParams, ...op.headerParams, ...op.cookieParams]) {
      collectRefNames(p.type, requestRoots)
    }
    collectRefNames(op.response, responseRoots)
  }
  const req = reachableModels(doc, requestRoots)
  const res = reachableModels(doc, responseRoots)
  const out: Record<string, SurfaceUsage> = {}
  for (const m of [...doc.models].sort((a, b) => byCodeUnit(a.name, b.name))) {
    const r = req.has(m.name)
    const s = res.has(m.name)
    out[m.name] = r && s ? 'both' : r ? 'request' : s ? 'response' : 'unused'
  }
  return out
}

/**
 * Optional metadata a generation run knows and a bare document does not:
 * which module each operation lands in and the symbols it exports.
 */
export interface SurfaceMetadata {
  moduleOf?: (op: IrOperation) => string | undefined
  symbolsOf?: (op: IrOperation) => readonly string[]
}

/** Extract the comparable surface from a parsed document. */
export function extractSurface(doc: IrDocument, meta: SurfaceMetadata = {}): ApiSurface {
  const operations: Record<string, SurfaceOperation> = {}
  for (const op of [...doc.operations].sort((a, b) => byCodeUnit(a.id, b.id))) {
    const s = surfaceOf(op)
    const module = meta.moduleOf?.(op)
    if (module !== undefined) s.module = module
    const symbols = meta.symbolsOf?.(op)
    if (symbols && symbols.length > 0) s.symbols = symbols
    operations[op.id] = s
  }
  const models: Record<string, Record<string, string>> = {}
  const aliases: Record<string, SurfaceAlias> = {}
  for (const m of [...doc.models].sort((a, b) => byCodeUnit(a.name, b.name))) {
    if (m.type.kind === 'object' && m.type.fields.length > 0) {
      const fields: Record<string, string> = {}
      for (const f of [...m.type.fields].sort((a, b) => byCodeUnit(a.name, b.name))) {
        fields[f.name] = `${renderType(f.type)}${f.required ? '' : ' (optional)'}`
      }
      models[m.name] = fields
    } else {
      const members = membersOf(m.type)
      aliases[m.name] = members ? { type: renderType(m.type), members } : { type: renderType(m.type) }
    }
  }
  return { version: 2, title: doc.title, operations, models, aliases, usage: usageOf(doc) }
}

function surfaceOf(op: IrOperation): SurfaceOperation {
  const params: Record<string, string> = {}
  const requiredParams: string[] = []
  for (const p of [...op.pathParams, ...op.queryParams].sort((a, b) => byCodeUnit(a.name, b.name))) {
    params[p.name] = renderType(p.type)
    // A PATH param is required by construction — a URL cannot omit a segment —
    // whatever the spec marked it.
    if (p.required || op.pathParams.includes(p)) requiredParams.push(p.name)
  }
  const out: SurfaceOperation = { id: op.id, method: op.method, path: op.path, params, requiredParams }
  if (op.body !== undefined) out.body = `${op.body.encoding} ${renderType(op.body.type)}`
  if (op.response !== undefined) out.response = renderType(op.response)
  if (op.stream !== undefined) {
    out.stream = `${op.stream.format} ${op.stream.format === 'sse' && op.stream.data === 'text' ? 'string' : renderType(op.stream.event)}`
  }
  if (op.summary !== undefined) out.summary = op.summary
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
    | 'stream-added'
    | 'stream-removed'
    | 'stream-changed'
    | 'model-removed'
    | 'model-added'
    | 'field-removed'
    | 'field-type-changed'
    | 'field-now-optional'
    | 'field-now-nullable'
    | 'field-no-longer-nullable'
    | 'field-added'
    | 'model-type-changed'
    | 'member-removed'
    | 'member-added'
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
    // A stream APPEARING is additive (nothing consumed it); disappearing or
    // changing what an event carries breaks every `for await` over it.
    if (was.stream === undefined && now.stream !== undefined) {
      add('additive', 'stream-added', id, `now streams ${now.stream}`)
    } else if (was.stream !== undefined && now.stream === undefined) {
      add('breaking', 'stream-removed', id, `no longer streams (was ${was.stream})`)
    } else if (was.stream !== now.stream) {
      add('breaking', 'stream-changed', id, `stream ${was.stream} → ${now.stream}`)
    }
  }
  for (const id of Object.keys(after.operations)) {
    if (before.operations[id] === undefined) {
      const now = after.operations[id] as SurfaceOperation
      add('additive', 'operation-added', id, `\`${now.method} ${now.path}\``)
    }
  }

  const usage = (name: string): SurfaceUsage => after.usage?.[name] ?? before.usage?.[name] ?? 'unused'
  // Where the CLIENT sends a model, narrowing it breaks existing calls; where
  // it only receives one, widening it is what the app has not handled. A model
  // no operation reaches is treated as both -- the conservative reading.
  const sends = (name: string): boolean => usage(name) !== 'response'
  const receives = (name: string): boolean => usage(name) !== 'request'

  for (const [name, was] of Object.entries(before.models)) {
    const now = after.models[name]
    if (!now) {
      if (after.aliases?.[name]) {
        add('breaking', 'model-type-changed', name, `object → ${after.aliases[name]?.type}`)
      } else {
        add('breaking', 'model-removed', name, 'model no longer exists')
      }
      continue
    }
    for (const [field, type] of Object.entries(was)) {
      const nowType = now[field]
      if (nowType === undefined) {
        add('breaking', 'field-removed', `${name}.${field}`, `was ${type}`)
        continue
      }
      if (nowType === type) continue
      const wasOptional = type.endsWith('(optional)')
      const isOptional = nowType.endsWith('(optional)')
      const bare = (t: string): string => t.replace(/ \(optional\)$/, '')
      const wasNull = bare(type).endsWith(' | null')
      const isNull = bare(nowType).endsWith(' | null')
      const core = (t: string): string => bare(t).replace(/ \| null$/, '')
      if (!wasOptional && isOptional && core(type) === core(nowType) && wasNull === isNull) {
        // The subtle one. The app reads the field unconditionally today and
        // keeps typechecking against the regenerated optional type only
        // because it never asks; at runtime it is now sometimes absent.
        add('breaking', 'field-now-optional', `${name}.${field}`, 'required → optional')
      } else if (core(type) === core(nowType) && wasOptional === isOptional && wasNull !== isNull) {
        if (isNull) {
          // The app reads a value that can now be null.
          add(receives(name) ? 'breaking' : 'additive', 'field-now-nullable', `${name}.${field}`, `${bare(type)} → ${bare(nowType)}`)
        } else {
          // A caller that sends null is now rejected.
          add(sends(name) ? 'breaking' : 'additive', 'field-no-longer-nullable', `${name}.${field}`, `${bare(type)} → ${bare(nowType)}`)
        }
      } else {
        add('breaking', 'field-type-changed', `${name}.${field}`, `${type} → ${nowType}`)
      }
    }
    for (const field of Object.keys(now)) {
      if (was[field] === undefined) add('additive', 'field-added', `${name}.${field}`, now[field] as string)
    }
  }
  for (const name of Object.keys(after.models)) {
    if (before.models[name] === undefined && before.aliases?.[name] === undefined) add('additive', 'model-added', name, 'new model')
  }

  for (const [name, was] of Object.entries(before.aliases ?? {})) {
    const now = after.aliases?.[name]
    if (!now) {
      if (after.models[name]) add('breaking', 'model-type-changed', name, `${was.type} → object`)
      else add('breaking', 'model-removed', name, 'model no longer exists')
      continue
    }
    if (now.type === was.type) continue
    if (was.members && now.members) {
      // An enum or union: classify each member that moved.
      const removed = was.members.filter((m) => !now.members?.includes(m))
      const added = now.members.filter((m) => !was.members?.includes(m))
      for (const m of removed) {
        add(sends(name) ? 'breaking' : 'additive', 'member-removed', name, `${m} no longer accepted`)
      }
      for (const m of added) {
        add(receives(name) ? 'breaking' : 'additive', 'member-added', name, `${m} may now be returned`)
      }
      continue
    }
    add('breaking', 'model-type-changed', name, `${was.type} → ${now.type}`)
  }
  for (const name of Object.keys(after.aliases ?? {})) {
    if (before.aliases?.[name] === undefined && before.models[name] === undefined) add('additive', 'model-added', name, 'new model')
  }

  // Breaking first, then by subject — the order someone reads it in.
  return changes.sort((a, b) =>
    a.severity === b.severity ? byCodeUnit(a.subject, b.subject) : a.severity === 'breaking' ? -1 : 1,
  )
}

/**
 * Diff this run's surface against the COMMITTED one (the previous run's
 * `api-surface.json` text), or `[]` when there is none to compare.
 *
 * A MISSING baseline returns no changes rather than reporting every operation
 * as added: the first run has nothing to compare against, and a wall of
 * "additive" on day one teaches people to skim the section. An UNREADABLE or
 * wrong-version baseline is treated the same way -- a diff computed against a
 * shape this code does not understand is worse than no diff.
 *
 * Shared by the CLI and the Vite plugin, so the two cannot disagree about what
 * a contract change is.
 */
export function diffCommittedSurface(previous: string | undefined, now: ApiSurface): SurfaceChange[] {
  if (previous === undefined) return []
  let parsed: ApiSurface
  try {
    parsed = JSON.parse(previous) as ApiSurface
  } catch {
    return []
  }
  if (parsed?.version !== now.version) return []
  return diffSurface(parsed, now)
}
