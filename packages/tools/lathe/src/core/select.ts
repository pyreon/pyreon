/**
 * `filters` — generate a SUBSET of a spec.
 *
 * Large public specs (Stripe's 600 operations, GitHub's 1,000) are rarely
 * consumed whole; an app talks to a handful of resources. Without a filter the
 * choice was to generate everything or to hand-edit the spec, and a hand-edited
 * spec is a fork that stops receiving the vendor's updates.
 *
 * Filtering happens on the IR, after the spec is read, so it can match what an
 * author sees in the spec (the `operationId`, the `{param}` path, every tag)
 * AND what Lathe generated (the endpoint name). Models only the excluded
 * operations used are dropped with them, and so are the notes about both —
 * a 3-operation client should not report 200 losses in code it never emitted.
 */

import type { HttpMethod, IrDocument, IrOperation } from './ir'
import { collectRefNames, operationTypes } from './walk'
import { closest } from './suggest'

/** Methods as a matcher accepts them — either case. */
export type LatheHttpMethod = HttpMethod | Lowercase<HttpMethod>

/**
 * Which operations one matcher selects. Every field given must match (AND);
 * a field given as a list matches when ANY entry does (OR).
 */
export interface LatheOperationMatcher {
  /** A tag, matched against EVERY tag the spec gives the operation. */
  tag?: string | readonly string[] | undefined
  /**
   * A glob over the spec's path, `{param}` form: `/pets/*`, `/admin/**`.
   * `*` matches within one segment, `**` across segments, `?` one character;
   * braces are literal.
   */
  path?: string | readonly string[] | undefined
  /** A glob over the spec's `operationId` OR the generated endpoint name. */
  operationId?: string | readonly string[] | undefined
  /** An HTTP method, either case. */
  method?: LatheHttpMethod | readonly LatheHttpMethod[] | undefined
}

/** See `LatheSection.filters`. */
export interface LatheFilters {
  /** Keep only operations some matcher selects. Absent keeps everything. */
  include?: LatheOperationMatcher | readonly LatheOperationMatcher[] | undefined
  /** Then drop operations any matcher selects. */
  exclude?: LatheOperationMatcher | readonly LatheOperationMatcher[] | undefined
  /**
   * `reachable` (the default) drops models no kept operation reaches; `all`
   * keeps every model, for a spec whose models are consumed on their own.
   */
  models?: 'reachable' | 'all' | undefined
}

const MATCHER_KEYS = ['tag', 'path', 'operationId', 'method'] as const

/** Compile a glob. Only `*`, `**` and `?` are special; everything else is literal. */
export function globToRegExp(glob: string): RegExp {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*'
        i++
      } else {
        out += '[^/]*'
      }
    } else if (c === '?') {
      out += '[^/]'
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`)
}

const list = <T>(v: T | readonly T[] | undefined): readonly T[] =>
  v === undefined ? [] : Array.isArray(v) ? (v as readonly T[]) : [v as T]

/** Validate one matcher's shape, with the config location in every message. */
function checkMatcher(m: unknown, where: string): LatheOperationMatcher {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) {
    throw new Error(`[Pyreon] lathe: \`${where}\` must be an object like \`{ tag: 'pets' }\`.`)
  }
  const keys = Object.keys(m)
  for (const k of keys) {
    if (!(MATCHER_KEYS as readonly string[]).includes(k)) {
      const best = closest(k, MATCHER_KEYS)
      throw new Error(
        `[Pyreon] lathe: \`${where}\` has an unknown key \`${k}\`.${best ? ` Did you mean \`${best}\`?` : ''} Known: ${MATCHER_KEYS.join(', ')}.`,
      )
    }
  }
  if (keys.every((k) => (m as Record<string, unknown>)[k] === undefined)) {
    throw new Error(`[Pyreon] lathe: \`${where}\` is empty, so it would match every operation. Name a tag, path, operationId or method.`)
  }
  return m as LatheOperationMatcher
}

/** Does `m` select `op`? */
function matches(op: IrOperation, m: LatheOperationMatcher): boolean {
  const tags = op.source?.tags.length ? op.source.tags : [op.tag]
  const tagList = list(m.tag)
  if (tagList.length > 0 && !tagList.some((t) => tags.includes(t))) return false
  const methods = list(m.method)
  if (methods.length > 0 && !methods.some((x) => x.toUpperCase() === op.method)) return false
  const paths = list(m.path)
  const specPath = op.source?.path ?? op.path
  if (paths.length > 0 && !paths.some((g) => globToRegExp(g).test(specPath))) return false
  const ids = list(m.operationId)
  if (
    ids.length > 0 &&
    !ids.some((g) => {
      const re = globToRegExp(g)
      return re.test(op.id) || (op.source?.operationId !== undefined && re.test(op.source.operationId))
    })
  ) {
    return false
  }
  return true
}

/** "Did you mean" for a matcher that selected nothing — tags and ids are the usual typos. */
function nothingMatched(doc: IrDocument, m: LatheOperationMatcher, where: string): Error {
  const hints: string[] = []
  for (const t of list(m.tag)) {
    const all = [...new Set(doc.operations.flatMap((o) => (o.source?.tags.length ? o.source.tags : [o.tag])))]
    const best = closest(t, all)
    if (best) hints.push(`tag \`${t}\` -> \`${best}\`?`)
  }
  for (const id of list(m.operationId)) {
    if (/[*?]/.test(id)) continue
    const all = doc.operations.flatMap((o) => [o.id, ...(o.source?.operationId ? [o.source.operationId] : [])])
    const best = closest(id, all)
    if (best) hints.push(`operationId \`${id}\` -> \`${best}\`?`)
  }
  return new Error(
    `[Pyreon] lathe: \`${where}\` matches no operation in the spec, so it filters nothing it was written for.` +
      (hints.length > 0 ? ` Did you mean: ${hints.join(', ')}` : ' Check it against the spec (paths use `{param}` form).'),
  )
}

/**
 * Apply `filters`. Returns a new document; the input is not modified.
 *
 * A matcher that selects NOTHING is an error, for include and exclude alike: a
 * typo'd tag in `include` otherwise yields an empty client, and one in
 * `exclude` generates the very operations it was meant to remove.
 */
export function applyFilters(doc: IrDocument, filters: LatheFilters | undefined): IrDocument {
  if (!filters) return doc
  const include = list(filters.include).map((m, i, all) =>
    checkMatcher(m, all.length > 1 || Array.isArray(filters.include) ? `filters.include[${i}]` : 'filters.include'),
  )
  const exclude = list(filters.exclude).map((m, i, all) =>
    checkMatcher(m, all.length > 1 || Array.isArray(filters.exclude) ? `filters.exclude[${i}]` : 'filters.exclude'),
  )
  const models = filters.models ?? 'reachable'
  if (models !== 'reachable' && models !== 'all') {
    throw new Error(`[Pyreon] lathe: \`filters.models\` must be 'reachable' or 'all'; got \`${String(models)}\`.`)
  }
  if (include.length === 0 && exclude.length === 0) return doc

  include.forEach((m, i) => {
    if (!doc.operations.some((op) => matches(op, m))) {
      throw nothingMatched(doc, m, Array.isArray(filters.include) ? `filters.include[${i}]` : 'filters.include')
    }
  })
  exclude.forEach((m, i) => {
    if (!doc.operations.some((op) => matches(op, m))) {
      throw nothingMatched(doc, m, Array.isArray(filters.exclude) ? `filters.exclude[${i}]` : 'filters.exclude')
    }
  })

  const kept = doc.operations.filter(
    (op) => (include.length === 0 || include.some((m) => matches(op, m))) && !exclude.some((m) => matches(op, m)),
  )
  const droppedAt = doc.operations.filter((op) => !kept.includes(op)).flatMap((op) => (op.source ? [op.source.at] : []))

  let keptModels = doc.models
  if (models === 'reachable') {
    const byName = new Map(doc.models.map((m) => [m.name, m]))
    const reached = new Set<string>()
    const queue: string[] = []
    const seed = new Set<string>()
    for (const op of kept) for (const t of operationTypes(op)) collectRefNames(t, seed)
    queue.push(...seed)
    while (queue.length > 0) {
      const name = queue.pop() as string
      if (reached.has(name)) continue
      reached.add(name)
      const m = byName.get(name)
      if (!m) continue
      const next = new Set<string>()
      collectRefNames(m.type, next)
      for (const n of next) if (!reached.has(n)) queue.push(n)
    }
    keptModels = doc.models.filter((m) => reached.has(m.name))
    for (const m of doc.models) if (!reached.has(m.name) && m.source) droppedAt.push(m.source.at)
  }

  const under = (at: string): boolean => droppedAt.some((d) => at === d || at.startsWith(`${d}/`))
  return {
    ...doc,
    operations: kept,
    models: keptModels,
    notes: doc.notes.filter((n) => !under(n.at)),
  }
}
