/**
 * Infinite queries from an EXPLICIT pagination declaration (audit E3).
 *
 * Nothing here guesses. A spec does not say, in any standard way, WHICH query
 * parameter advances a page or WHERE the next value is in the response — a
 * `next_cursor` field, the last item's id (Stripe's `starting_after`), an
 * offset — and a wrong guess produces a `getNextPageParam` that loops forever
 * or stops after one page, silently. So the operation declares it, through the
 * `x-pyreon-pagination` extension or the `pagination` config entry, and the
 * declaration is CHECKED against the spec's own types here before anything is
 * emitted: a path that does not exist, or a cursor whose type the parameter
 * cannot take, is an error at generation time rather than a hook that breaks
 * at runtime.
 */
import type { IrOperation, IrPagination, IrType } from '../core/ir'
import { propKey, typeIdent } from '../core/naming'
import type { ModelTypes } from './operation-types'
import { resolve as resolveRef } from './operation-types'
import { tsType } from './schema'
import type { SourceFile } from './writer'

/**
 * A type with refs AND nullability peeled — a nullable cursor (`string | null`,
 * the usual "no more pages" signal) is still a string cursor — and an enum
 * reduced to the scalar kind of its values.
 */
function resolve(type: IrType, models: ModelTypes): IrType {
  let t = resolveRef(type, models)
  for (let i = 0; t.kind === 'nullable' && i < 16; i++) t = resolveRef(t.inner, models)
  if (t.kind === 'enum') {
    const v = t.values.find((x) => x !== null)
    return typeof v === 'number' ? { kind: 'number', integer: false } : typeof v === 'boolean' ? { kind: 'boolean' } : { kind: 'string' }
  }
  return t
}

/** The page-param TYPE for a declaration, or why the declaration is wrong. */
export function checkPagination(op: IrOperation, models: ModelTypes): string | undefined {
  const p = op.pagination
  if (!p) return undefined
  const where = `pagination for \`${op.id}\``
  const param = op.queryParams.find((q) => q.name === p.param)
  if (!param) {
    const known = op.queryParams.map((q) => q.name).join(', ') || 'none'
    return `${where}: \`${p.param}\` is not a query parameter of this operation (it has: ${known}).`
  }
  const paramKind = resolve(param.type, models).kind
  if (!op.response || op.response.kind === 'unknown') {
    return `${where}: the operation has no JSON response to read the next page from.`
  }
  const at = (path: string): IrType | string => walk(op.response as IrType, path, models, where)
  if (p.hasMore !== undefined) {
    const t = at(p.hasMore)
    if (typeof t === 'string') return t
    if (t.kind !== 'boolean') return `${where}: \`hasMore\` (\`${p.hasMore}\`) must be a boolean, it is ${t.kind}.`
  }
  switch (p.kind) {
    case 'cursor': {
      if (paramKind !== 'string' && paramKind !== 'number') {
        return `${where}: a cursor parameter must be a string or a number, \`${p.param}\` is ${paramKind}.`
      }
      const t = at(p.next)
      if (typeof t === 'string') return t
      if (t.kind !== paramKind) {
        return `${where}: \`next\` (\`${p.next}\`) is ${t.kind}, but \`${p.param}\` takes a ${paramKind}.`
      }
      return undefined
    }
    case 'lastItem': {
      if (paramKind !== 'string' && paramKind !== 'number') {
        return `${where}: a cursor parameter must be a string or a number, \`${p.param}\` is ${paramKind}.`
      }
      const items = at(p.items)
      if (typeof items === 'string') return items
      if (items.kind !== 'array') return `${where}: \`items\` (\`${p.items || '(response)'}\`) must be an array.`
      const item = resolve(items.items, models)
      const f = item.kind === 'object' ? item.fields.find((x) => x.name === p.field) : undefined
      if (!f) return `${where}: the items have no field \`${p.field}\`.`
      const fk = resolve(f.type, models).kind
      if (fk !== paramKind) return `${where}: item field \`${p.field}\` is ${fk}, but \`${p.param}\` takes a ${paramKind}.`
      return undefined
    }
    case 'offset':
    case 'page': {
      if (paramKind !== 'number') return `${where}: an ${p.kind} parameter must be a number, \`${p.param}\` is ${paramKind}.`
      const items = at(p.items)
      if (typeof items === 'string') return items
      if (items.kind !== 'array') return `${where}: \`items\` (\`${p.items || '(response)'}\`) must be an array.`
      return undefined
    }
  }
}

/** Resolve a dotted path into a response type. `''` is the response itself. */
function walk(type: IrType, path: string, models: ModelTypes, where: string): IrType | string {
  let t = resolve(type, models)
  if (path === '') return t
  for (const seg of path.split('.')) {
    if (t.kind !== 'object') return `${where}: \`${path}\` does not exist in the response (\`${seg}\` is inside a ${t.kind}).`
    const f = t.fields.find((x) => x.name === seg)
    if (!f) return `${where}: \`${path}\` does not exist in the response (no field \`${seg}\`).`
    t = resolve(f.type, models)
  }
  return t
}

/** `last?.a?.["b-c"]` — optional at every step, because a field may be. */
function access(root: string, path: string): string {
  if (path === '') return root
  return path
    .split('.')
    .reduce((acc, seg) => {
      const key = propKey(seg)
      return key === seg ? `${acc}?.${seg}` : `${acc}?.[${key}]`
    }, root)
}

function pageParamType(p: IrPagination, op: IrOperation): string {
  if (p.kind === 'offset' || p.kind === 'page') return 'number'
  const param = op.queryParams.find((q) => q.name === p.param)
  return `${param ? tsType(param.type) : 'string'} | undefined`
}

function initial(p: IrPagination): string {
  if (p.kind === 'offset') return String(p.initial ?? 0)
  if (p.kind === 'page') return String(p.initial ?? 1)
  return 'undefined'
}

function nextBody(p: IrPagination): string[] {
  const stop = p.hasMore !== undefined ? [`    if (${access('last', p.hasMore)} === false) return undefined`] : []
  switch (p.kind) {
    case 'cursor':
      return [
        ...stop,
        `    const next = ${access('last', p.next)} ?? undefined`,
        "    return next === '' ? undefined : next",
      ]
    case 'lastItem':
      return [
        ...stop,
        `    const items = ${access('last', p.items)} ?? []`,
        '    const tail = items[items.length - 1]',
        `    return tail === undefined ? undefined : (tail${access('', p.field)} ?? undefined)`,
      ]
    case 'offset':
      return [...stop, `    const items = ${access('last', p.items)} ?? []`, '    return items.length === 0 ? undefined : current + items.length']
    case 'page':
      return [...stop, `    const items = ${access('last', p.items)} ?? []`, '    return items.length === 0 ? undefined : current + 1']
  }
}

/** Name of the options factory. */
export function infiniteOptionsName(op: IrOperation): string {
  return `${op.id}InfiniteOptions`
}

/**
 * Emit `<op>InfiniteOptions(args)` and `use<Op>Infinite(args, options?)`.
 *
 * The factory is the pure half: a loader can hand it to
 * `queryClient.prefetchInfiniteQuery`, and a test can drive it without a
 * component. The hook adds the "undefined args = not ready" contract every
 * generated query hook has.
 */
export function emitInfinite(f: SourceFile, op: IrOperation, disabledFn: string): void {
  const p = op.pagination
  if (!p) return
  const data = `Awaited<ReturnType<typeof ${op.id}>>`
  const input = `Parameters<typeof ${op.id}>[0]`
  const pp = pageParamType(p, op)
  const opts = `UseInfiniteQueryOptions<${data}, Error, readonly unknown[], ${pp}>`
  const name = infiniteOptionsName(op)
  const hook = `use${typeIdent(op.id)}Infinite`
  const describe =
    p.kind === 'cursor'
      ? `the next \`${p.param}\` is \`${p.next}\` from each page`
      : p.kind === 'lastItem'
        ? `the next \`${p.param}\` is the last item's \`${p.field}\``
        : p.kind === 'offset'
          ? `\`${p.param}\` advances by each page's length`
          : `\`${p.param}\` advances by one`
  f.line()
  f.doc(
    `Infinite-query options for \`${op.id}\` — ${describe}${p.hasMore ? `, until \`${p.hasMore}\` is false` : ''}.`,
    '',
    'Pure: hand it to `queryClient.prefetchInfiniteQuery` in a loader.',
  )
  f.line(`export function ${name}(args: ${input}): ${opts} {`)
  f.line('  return {')
  f.line(`    queryKey: [...${op.id}.key(args), 'infinite'],`)
  f.line(
    `    queryFn: ({ pageParam, signal }) => ${op.id}({ ...args, query: { ...args?.query, ${propKey(p.param)}: pageParam }, signal }),`,
  )
  f.line(`    initialPageParam: ${initial(p)},`)
  f.line(`    getNextPageParam: (last, _pages, ${p.kind === 'offset' || p.kind === 'page' ? 'current' : '_current'}) => {`)
  for (const l of nextBody(p)) f.line(l)
  f.line('    },')
  f.line('  }')
  f.line('}')
  f.line()
  f.doc(
    `\`${op.id}\`, a page at a time — \`q.data()?.pages\`, \`q.fetchNextPage()\`, \`q.hasNextPage()\`.`,
    '',
    'Return `undefined` from `args` to hold the request until the arguments are ready.',
    `\`${p.param}\` is set per page; a value passed in \`args\` is overridden.`,
    op.deprecated ? '' : undefined,
    op.deprecated ? '@deprecated The spec marks this operation deprecated.' : undefined,
  )
  f.line(`export function ${hook}(`)
  f.line(`  args: () => ${input} | undefined,`)
  f.line(`  options?: () => Omit<${opts}, 'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam'>,`)
  f.line(') {')
  f.line(`  return useInfiniteQuery<${data}, Error, readonly unknown[], ${pp}>(() => {`)
  f.line('    const a = args()')
  f.line('    const extra = options?.() ?? {}')
  f.line('    if (a === undefined) {')
  f.line('      return {')
  f.line(`        queryKey: [...${op.id}.key.prefix, 'infinite'],`)
  f.line(`        queryFn: ${disabledFn},`)
  f.line(`        initialPageParam: ${initial(p)},`)
  f.line('        getNextPageParam: () => undefined,')
  f.line('        ...extra,')
  f.line('        enabled: false,')
  f.line('      }')
  f.line('    }')
  f.line(`    return { ...${name}(a), ...extra, enabled: extra.enabled !== false }`)
  f.line('  })')
  f.line('}')
}
