/**
 * `naming` and `operations` — the author's say over what gets generated.
 *
 * Both run on the IR after the spec is read and filtered, and both produce
 * OUTPUT DIRECTIVES the emitters already honour (`IrOperation.hook`,
 * `.validate`, `.group`, `.pagination`) or plain renames. Neither knows about
 * any emitter, which is why a third-party plugin sees exactly the names the
 * built-ins will use.
 *
 * Every name an author supplies is checked the way Lathe checks its own:
 * valid on every target, clear of the names the emitted modules bind, and
 * unique — including case-insensitively where a name becomes a FILE, because
 * macOS and Windows would silently let one overwrite the other.
 */

import { byTag, isMutation } from '../emit/client'
import type { HttpMethod, IrDocument, IrOperation, IrParam, IrValidateMode } from './ir'
import { closest } from './suggest'
import { hookOf, modelIdent, operationIdent, tagFile, typeIdent } from './naming'
import { renameRefs } from './walk'

/** What `naming.operation` is told about one operation. */
export interface LatheOperationNameContext {
  /** The name Lathe would use — return it to keep it. */
  default: string
  /** The spec's `operationId`, verbatim; absent when Lathe derived the default. */
  operationId: string | undefined
  method: HttpMethod
  /** The spec's path, `{param}` form. */
  path: string
  /** Every tag the spec gives the operation. */
  tags: readonly string[]
}

/** What `naming.model` is told about one model. */
export interface LatheModelNameContext {
  /** The name Lathe would use — return it to keep it. */
  default: string
  /** The spec's `components.schemas` key; absent for a model Lathe synthesized. */
  name: string | undefined
}

/** What `naming.file` is told about one output group. */
export interface LatheFileNameContext {
  /** The file stem Lathe would use (`pet-store`) — return it to keep it. */
  default: string
  /** The group: the operations' tag, or (untagged) their path segment. */
  group: string
}

/** What `naming.hook` is told about one operation. */
export interface LatheHookNameContext {
  /** The hook name Lathe would use (`useGetPetById`) — return it to keep it. */
  default: string
  /** The operation's (final) endpoint name. */
  operation: string
  kind: 'query' | 'mutation'
}

/** See `LatheSection.naming`. */
export interface LatheNaming {
  /** The endpoint export for each operation (`getPetById`). */
  operation?: ((ctx: LatheOperationNameContext) => string) | undefined
  /** The schema + type for each model (`Pet`). */
  model?: ((ctx: LatheModelNameContext) => string) | undefined
  /** The file stem for each group — `endpoints/<stem>.ts`, `queries/<stem>.ts`. */
  file?: ((ctx: LatheFileNameContext) => string) | undefined
  /** The query / mutation hook for each operation; `false` generates none. */
  hook?: ((ctx: LatheHookNameContext) => string | false) | undefined
}

/**
 * One operation's settings — see `LatheSection.operations`. `pagination` has
 * the shape of `LatheSection.pagination`'s entries (typed there, to keep this
 * module free of the config's types).
 */
export interface LatheOperationSettings<P = unknown> {
  /** The hook's name, or `false` for no hook (the endpoint is still emitted). */
  hook?: string | false | undefined
  /** This operation's response validation, overriding the client-wide mode. */
  responseValidation?: IrValidateMode | undefined
  /** How to page through it — emits `use<Op>Infinite`. */
  pagination?: P | undefined
}

const SETTING_KEYS = ['hook', 'responseValidation', 'pagination'] as const
const VALIDATE_MODES: readonly IrValidateMode[] = ['strict', 'warn', 'off']

/** Call a user hook, attributing a throw or a non-string result to it. */
function callNaming<C, R>(hook: string, fn: (ctx: C) => R, ctx: C, what: string): R {
  let out: R
  try {
    out = fn(ctx)
  } catch (err) {
    throw new Error(`[Pyreon] lathe: \`naming.${hook}\` threw for ${what}: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    })
  }
  return out
}

/** Refuse two inputs mapping to one name, naming both. */
function assertUnique(names: ReadonlyMap<string, string>, hook: string, fold = false): void {
  const seen = new Map<string, string>()
  for (const [from, to] of names) {
    const key = fold ? to.toLowerCase() : to
    const prev = seen.get(key)
    if (prev !== undefined) {
      throw new Error(
        `[Pyreon] lathe: \`naming.${hook}\` maps both \`${prev}\` and \`${from}\` to \`${to}\`${fold ? ' (compared case-insensitively — these are file names)' : ''}. Names must stay unique.`,
      )
    }
    seen.set(key, from)
  }
}

/**
 * Apply `naming.operation`, `naming.model` and `naming.file`. Returns a new
 * document. (`naming.hook` runs with the per-operation settings, after them.)
 */
export function applyNaming(doc: IrDocument, naming: LatheNaming | undefined): IrDocument {
  if (!naming) return doc
  let out = doc

  if (naming.operation) {
    const fn = naming.operation
    const renames = new Map<string, string>()
    for (const op of out.operations) {
      const next = callNaming(
        'operation',
        fn,
        {
          default: op.id,
          operationId: op.source?.operationId,
          method: op.method,
          path: op.source?.path ?? op.path,
          tags: op.source?.tags ?? [op.tag],
        },
        `\`${op.id}\``,
      )
      if (typeof next !== 'string' || next !== operationIdent(next)) {
        throw new Error(
          `[Pyreon] lathe: \`naming.operation\` returned \`${String(next)}\` for \`${op.id}\`, which is not a usable endpoint name` +
            (typeof next === 'string' ? ` (a valid identifier, not a reserved word or a name the generated modules bind — e.g. \`${operationIdent(next)}\`).` : ' — it must return a string.'),
        )
      }
      renames.set(op.id, next)
    }
    assertUnique(renames, 'operation')
    out = { ...out, operations: out.operations.map((op) => ({ ...op, id: renames.get(op.id) as string })) }
  }

  if (naming.model) {
    const fn = naming.model
    const renames = new Map<string, string>()
    for (const m of out.models) {
      const next = callNaming('model', fn, { default: m.name, name: m.source?.name }, `\`${m.name}\``)
      if (typeof next !== 'string' || next !== modelIdent(next)) {
        throw new Error(
          `[Pyreon] lathe: \`naming.model\` returned \`${String(next)}\` for \`${m.name}\`, which is not a usable model name` +
            (typeof next === 'string' ? ` (PascalCase, not reserved, not a global the generated code uses — e.g. \`${modelIdent(next)}\`).` : ' — it must return a string.'),
        )
      }
      renames.set(m.name, next)
    }
    // Case-insensitive: every model gets a module of its own, named after it.
    assertUnique(renames, 'model', true)
    const rename = (n: string): string => renames.get(n) ?? n
    out = {
      ...out,
      models: out.models.map((m) => ({ ...m, name: rename(m.name), type: renameRefs(m.type, rename) })),
      operations: out.operations.map((op) => renameOperationRefs(op, rename)),
    }
  }

  if (naming.file) {
    const fn = naming.file
    const stems = new Map<string, string>()
    const members = new Map<string, IrOperation[]>()
    for (const [group, ops] of byTag(out)) {
      const def = tagFile(group)
      const next = callNaming('file', fn, { default: def, group }, `group \`${group}\``)
      if (typeof next !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next)) {
        throw new Error(
          `[Pyreon] lathe: \`naming.file\` returned \`${String(next)}\` for group \`${group}\` — a file stem must be lowercase kebab-case (\`[a-z0-9-]\`), e.g. \`${tagFile(String(next))}\`.`,
        )
      }
      stems.set(group, next)
      members.set(group, ops)
    }
    assertUnique(stems, 'file', true)
    const groupOf = new Map<IrOperation, string>()
    for (const [group, ops] of members) for (const op of ops) groupOf.set(op, stems.get(group) as string)
    out = { ...out, operations: out.operations.map((op) => ({ ...op, group: groupOf.get(op) ?? op.group })) }
  }
  return out
}

function renameOperationRefs(op: IrOperation, rename: (n: string) => string): IrOperation {
  const params = (list: readonly IrParam[]): IrParam[] => list.map((p) => ({ ...p, type: renameRefs(p.type, rename) }))
  return {
    ...op,
    pathParams: params(op.pathParams),
    queryParams: params(op.queryParams),
    headerParams: params(op.headerParams),
    cookieParams: params(op.cookieParams),
    ...(op.body ? { body: { ...op.body, type: renameRefs(op.body.type, rename) } } : {}),
    ...(op.response ? { response: renameRefs(op.response, rename) } : {}),
  }
}

/**
 * Find the operation a config key names: the generated endpoint name first,
 * then the spec's own `operationId` — an author reading the spec and an author
 * reading the generated code are both right.
 */
export function operationByKey(doc: IrDocument, key: string, where: string): IrOperation {
  const exact = doc.operations.find((o) => o.id === key)
  if (exact) return exact
  const bySpec = doc.operations.filter((o) => o.source?.operationId === key)
  if (bySpec.length === 1) return bySpec[0] as IrOperation
  const all = doc.operations.flatMap((o) => [o.id, ...(o.source?.operationId ? [o.source.operationId] : [])])
  const best = closest(key, all)
  throw new Error(
    `[Pyreon] lathe: \`${where}\` names no operation.${best ? ` Did you mean \`${best}\`?` : ''} Keys are the generated endpoint names or the spec's operationIds: ${[
      ...new Set(doc.operations.map((o) => o.id)),
    ]
      .slice(0, 20)
      .join(', ')}${doc.operations.length > 20 ? ', …' : ''}.`,
  )
}

/**
 * Apply `operations` (hook, responseValidation — pagination is merged by the
 * caller, which owns its validation) and then `naming.hook` for every
 * operation that has no explicit hook. Returns a new document.
 */
export function applyOperationSettings(
  doc: IrDocument,
  operations: Readonly<Record<string, LatheOperationSettings>> | undefined,
  hookNaming: LatheNaming['hook'],
): IrDocument {
  const settings = new Map<IrOperation, LatheOperationSettings>()
  for (const [key, entry] of Object.entries(operations ?? {})) {
    const where = `operations.${key}`
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`[Pyreon] lathe: \`${where}\` must be an object like \`{ hook: 'usePets' }\`.`)
    }
    for (const k of Object.keys(entry)) {
      if (!(SETTING_KEYS as readonly string[]).includes(k)) {
        const best = closest(k, SETTING_KEYS)
        throw new Error(
          `[Pyreon] lathe: \`${where}\` has an unknown key \`${k}\`.${best ? ` Did you mean \`${best}\`?` : ''} Known: ${SETTING_KEYS.join(', ')}.`,
        )
      }
    }
    if (entry.responseValidation !== undefined && !VALIDATE_MODES.includes(entry.responseValidation)) {
      throw new Error(
        `[Pyreon] lathe: \`${where}.responseValidation\` must be ${VALIDATE_MODES.join(', ')}; got \`${String(entry.responseValidation)}\`.`,
      )
    }
    if (entry.hook !== undefined && entry.hook !== false && typeof entry.hook !== 'string') {
      throw new Error(`[Pyreon] lathe: \`${where}.hook\` must be a hook name or \`false\`.`)
    }
    const op = operationByKey(doc, key, where)
    if (settings.has(op)) {
      throw new Error(`[Pyreon] lathe: \`operations\` configures \`${op.id}\` twice (by its endpoint name and by its operationId).`)
    }
    settings.set(op, entry)
  }

  const operationsOut = doc.operations.map((op) => {
    const s = settings.get(op)
    let hook = s?.hook ?? op.hook
    if (hook === undefined && hookNaming) {
      const next = callNaming(
        'hook',
        hookNaming,
        { default: `use${typeIdent(op.id)}`, operation: op.id, kind: isMutation(op) ? 'mutation' : 'query' },
        `\`${op.id}\``,
      )
      if (next !== false && typeof next !== 'string') {
        throw new Error(`[Pyreon] lathe: \`naming.hook\` returned \`${String(next)}\` for \`${op.id}\` — return a hook name or \`false\`.`)
      }
      hook = next
    }
    const validate = s?.responseValidation ?? op.validate
    return {
      ...op,
      ...(hook !== undefined ? { hook } : {}),
      ...(validate !== undefined ? { validate } : {}),
    }
  })
  return { ...doc, operations: operationsOut }
}

/**
 * Hook names must be valid, start with `use`, and not collide with anything
 * else the hook modules bind or re-export. The queries barrel re-exports every
 * tag module with `export *`, so ONE namespace spans the whole client.
 */
export function assertHookNames(doc: IrDocument): void {
  const bound = new Map<string, string>()
  const claim = (name: string, what: string): void => {
    const prev = bound.get(name)
    if (prev !== undefined) {
      throw new Error(
        `[Pyreon] lathe: the name \`${name}\` is used twice in the generated hooks — ${prev} and ${what}. Rename one with \`operations.<id>.hook\` or \`naming.hook\`.`,
      )
    }
    bound.set(name, what)
  }
  for (const fixed of ['useQuery', 'useMutation', 'useInfiniteQuery', 'UseQueryOptions', 'MutationOptions', 'UseInfiniteQueryOptions']) {
    claim(fixed, `\`@pyreon/query\`'s \`${fixed}\``)
  }
  for (const op of doc.operations) claim(op.id, `the endpoint \`${op.id}\``)
  for (const op of doc.operations) {
    const hook = hookOf(op)
    if (hook === undefined) continue
    if (!/^use[A-Z0-9_$][A-Za-z0-9_$]*$/.test(hook)) {
      throw new Error(
        `[Pyreon] lathe: \`${hook}\` (the hook for \`${op.id}\`) is not a hook name — it must start with \`use\` followed by an uppercase letter, digit or \`_\`, and be a valid identifier (e.g. \`use${typeIdent(hook)}\`).`,
      )
    }
    claim(hook, `the hook for \`${op.id}\``)
    if (op.pagination) {
      claim(`${hook}Infinite`, `the infinite hook for \`${op.id}\``)
      claim(`${op.id}InfiniteOptions`, `the infinite-options factory for \`${op.id}\``)
    }
  }
}
