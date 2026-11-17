/* oxlint-disable complexity, max-lines-per-function -- the lowering is one switch over the five hook kinds with their request shapes; each branch is flat and splitting it only moves the table elsewhere */
// How `@pyreon/feature`'s generated CRUD hooks cross to native: the five hooks whose web body is ONE request
// against the feature's `api` lower onto `@pyreon/query`'s own native containers, with the request the web sends.
//
//   const list = Todo.useList()        → PyreonQuery<[PyreonFeatureSchema_Todo]>   GET    <api>
//   const one = Todo.useById(id)       → PyreonQuery<PyreonFeatureSchema_Todo>     GET    <api>/<encoded id>
//   const add = Todo.useCreate()       → PyreonMutation<PyreonFeatureSchema_Todo>  POST   <api>          json: vars
//   const edit = Todo.useUpdate()      → PyreonMutation<PyreonFeatureSchema_Todo>  PUT    <api>/<id>     json: vars.data
//   const del = Todo.useDelete()       → PyreonMutation<Void>                      DELETE <api>/<id>
//
// What the mutations do to the queries is the web's, through `PyreonQueryCache` (the native query client): a
// successful create / update / delete invalidates every `<name>` query — the web's
// `invalidateQueries({ queryKey: [name] })`, natively every cached key `<name>` or `<name>:…` is marked stale and every
// mounted one refetches — and `useUpdate` writes `{ id, data }` into the cached `[name, id]` record optimistically
// before the request, rolling it back if the request fails. The optimistic write needs `data` to be an object literal
// of the schema's own fields (it is applied field by field to the typed record); any other `data` skips it, NAMED.
//
// The wire format is `define-feature.ts`'s `createFetcher`, which sends through `@pyreon/http`: an absolute `api` is
// the request URL as written, the id is ONE path segment encoded by the web's own `encodePathParam` (here the
// runtime's `PyreonURL.encodePathParam`, which mirrors it), a `json` body is `JSON.stringify(vars)` with
// `content-type: application/json`, and a non-2xx answer rejects. The containers, harnesses and call-site emit are
// `@pyreon/query`'s (`queryContainerDecl`, `mutationDecl`, `mutateCallSpec`): this file builds requests, nothing else.
//
// What does not lower is NAMED, never emitted verbatim: an `api` that is not an absolute literal URL (native has no
// origin to resolve `/api/todos` against), a custom `fetcher`, every other generated hook (`useSearch`, `useForm`,
// `useTable`, `useStore`, …) and every `useList` option but a literal `staleTime`.

import {
  MUTATE_ASYNC_TYPE,
  MUTATE_TYPE,
  mutateAsyncExpr,
  mutateCallSpec,
  mutateExpr,
  mutationDecl,
  mutationReceiver,
  queryContainerDecl,
  queryReceiver,
  scanMutations,
  type MutateQueryEffects,
  type QueryPayload,
} from '@pyreon/query/native-plugin'
import {
  isNullishLiteral,
  propName,
  staticPropKey,
  topLevelDeclarators,
  unwrapTypeLayers,
  type DeclCallRecognizer,
  type DeclEmitter,
  type EmitContext,
  type ExprEmitter,
  type ExprIR,
  type ExtDecl,
  type MethodCallRecognizer,
  type ModuleScan,
  type ReceiverLowering,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

/** Declaration types the CRUD hooks lower to (keys of the plugin's `decls` / `receivers`). */
export const CRUD_QUERY_TYPE = 'feature-query'
export const CRUD_MUTATION_TYPE = 'feature-mutation'

/** The generated hooks that lower, and what each one is. */
const QUERY_HOOKS: ReadonlySet<string> = new Set(['useList', 'useById'])
const MUTATION_HOOKS: ReadonlySet<string> = new Set(['useCreate', 'useUpdate', 'useDelete'])
const LOWERED_HOOKS = 'Only `useList`, `useById`, `useCreate`, `useUpdate` and `useDelete` lower to native'

/** Why each generated hook that does NOT lower stays web, and what to write instead. */
const UNLOWERED_HOOKS: ReadonlyMap<string, string> = new Map([
  [
    'useSearch',
    'its query is re-keyed on a signal term, which the feature hook builds at runtime. Write the search as `useQuery` from `@pyreon/query` against the absolute search URL — it lowers',
  ],
  [
    'useForm',
    'the feature form (`@pyreon/form`, schema validation, edit-mode record load) has no native counterpart. Hold the fields in signals and save with `useCreate()` / `useUpdate()`, which lower',
  ],
  [
    'useTable',
    'the TanStack table instance has no native counterpart. Render the rows of `useList()` with `<For>`',
  ],
  [
    'useStore',
    'the feature store (`@pyreon/store`) does not lower. Hold the selection in a `signal`',
  ],
  [
    'queryKey',
    'the key addresses the web `QueryClient` (`useQueryClient()`), which does not lower. The feature\'s own mutations already refresh its queries natively',
  ],
])

/** A feature binding's CRUD facts, recorded by the scan before any component is parsed. */
export interface CrudFeature {
  /** The feature's `name` literal (the query-key root), when it is one. */
  readonly featureName: string | undefined
  /** The absolute `api` URL the requests go to; absent when `refusal` says why there is none. */
  readonly api: string | undefined
  /** Why no hook of this feature can lower (a relative / non-literal `api`, a custom `fetcher`). */
  readonly refusal: string | undefined
}

interface CrudFacts {
  /** File-scope `defineFeature` bindings, by name. */
  readonly features: Map<string, CrudFeature>
  /** Feature bindings a lowered hook used — `finishModule` checks each one's declaration lowered too. */
  readonly used: Set<string>
  /** Mutation bindings (`const add = Todo.useCreate()`) → the feature and the hook. */
  readonly mutations: Map<string, { readonly feature: string; readonly hook: string; readonly type: TypeIR }>
  /** Each feature's schema fields as its record struct declares them — recorded by the plugin's scan. */
  readonly schemas: Map<string, readonly SchemaField[]>
}

/** One field of a feature's record struct. */
export interface SchemaField {
  readonly name: string
  readonly type: 'string' | 'number' | 'boolean'
}

const FACTS_KEY = '@pyreon/feature:crud'

export function crudFacts(source: { fileState<T>(key: string, init: () => T): T }): CrudFacts {
  return source.fileState<CrudFacts>(FACTS_KEY, () => ({
    features: new Map(),
    used: new Set(),
    mutations: new Map(),
    schemas: new Map(),
  }))
}

/** The struct `defineFeature` declares for a binding's schema — the decoded element type. */
export const featureSchemaStruct = (binding: string): string => `PyreonFeatureSchema_${binding}`

const ABSOLUTE = /^https?:\/\/[^/]/i
/** A path token the web's `applyPathParams` would try to fill (`:tenant`, `\:`) — it throws for a list URL holding one. */
const PATH_TOKEN = /\\:|:[A-Za-z_]/

/** The `api` / `fetcher` facts of one `defineFeature({ … })` config. */
function readCrudConfig(binding: string, config: AnyNode): CrudFeature {
  let featureName: string | undefined
  let apiNode: AnyNode | undefined
  let hasApi = false
  let fetcher = false
  for (const prop of (config.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const key = staticPropKey(prop)
    const value = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (key === 'name' && value?.type === 'Literal' && typeof value.value === 'string') featureName = value.value
    else if (key === 'api') {
      hasApi = true
      apiNode = value
    } else if (key === 'fetcher') fetcher = true
  }
  const fix = `Write the absolute URL literally: \`defineFeature({ …, api: 'https://api.example.com/${featureName ?? 'items'}' })\`.`
  const refuse = (why: string): CrudFeature => ({ featureName, api: undefined, refusal: why })
  if (fetcher) {
    return refuse(
      `\`${binding}\` passes a custom \`fetcher\`, which is a JS function the native request cannot call — remove it (the native request is sent by the platform HTTP client) or keep this hook web-only.`,
    )
  }
  if (!hasApi) return refuse(`\`${binding}\` declares no \`api\`, so there is no URL to request. ${fix}`)
  const literal =
    apiNode?.type === 'Literal' && typeof apiNode.value === 'string'
      ? (apiNode.value as string)
      : apiNode?.type === 'TemplateLiteral' && (apiNode.expressions as AnyNode[]).length === 0
        ? ((apiNode.quasis as AnyNode[])[0]?.value?.cooked as string | undefined)
        : undefined
  if (literal === undefined) {
    return refuse(`\`${binding}\`'s \`api\` is not a string literal, so the request URL cannot be read at compile time. ${fix}`)
  }
  if (!ABSOLUTE.test(literal)) {
    return refuse(
      `\`${binding}\`'s \`api\` (\`${literal}\`) is not an absolute \`http(s)://\` URL. The web resolves a relative URL against the page's origin; a native app has no origin. ${fix}`,
    )
  }
  if (PATH_TOKEN.test(literal.replace(/^https?:\/\//i, ''))) {
    return refuse(
      `\`${binding}\`'s \`api\` (\`${literal}\`) holds a \`:param\` path token, which the web's request builder tries to fill and throws for. Write the URL without one.`,
    )
  }

  return { featureName, api: literal, refusal: undefined }
}

/** The scan half: record every file-scope feature's CRUD facts, and the awaited `mutateAsync` calls. */
export function scanCrud(scan: ModuleScan): void {
  const facts = crudFacts(scan)
  for (const node of scan.body as readonly AnyNode[]) {
    for (const d of topLevelDeclarators(node) as readonly AnyNode[]) {
      const init = unwrapTypeLayers(d.init as AnyNode | undefined)
      if (d.id?.type !== 'Identifier' || init?.type !== 'CallExpression') continue
      if (init.callee?.type !== 'Identifier' || init.callee.name !== 'defineFeature') continue
      const config = unwrapTypeLayers(((init.arguments as AnyNode[] | undefined) ?? [])[0])
      if (config?.type !== 'ObjectExpression') continue
      facts.features.set(d.id.name as string, readCrudConfig(d.id.name as string, config))
    }
  }
  scanMutations(scan)
}

/** `Todo.useList` → `{ feature: 'Todo', hook: 'useList' }` when `Todo` is a file-scope feature, else `undefined`. */
function crudCallee(callee: AnyNode, facts: CrudFacts): { feature: string; hook: string } | undefined {
  const c = unwrapTypeLayers(callee)
  if (c?.type !== 'MemberExpression' || c.computed || c.object?.type !== 'Identifier' || c.property?.type !== 'Identifier') return undefined
  const feature = c.object.name as string

  return facts.features.has(feature) ? { feature, hook: c.property.name as string } : undefined
}

const encodeSegment = (id: ExprIR): ExprIR => ({
  kind: 'call',
  callee: { kind: 'member', object: { kind: 'identifier', name: 'PyreonURL' }, property: 'encodePathParam' },
  args: [id],
})

/** `<api>/<encoded id>` — the web's `${url}/:id` with `params: { id }`. */
const idUrl = (api: string, id: ExprIR): ExprIR => ({ kind: 'template', quasis: [`${api}/`, ''], exprs: [encodeSegment(id)] })

const JSON_HEADERS = { 'content-type': 'application/json' } as const

/**
 * `const x = Todo.<hook>(…)`: the five CRUD hooks lower; every other generated hook, and every shape of the five that
 * does not, is claimed (`null`) with a warning naming why — never emitted as a verbatim call neither target has.
 */
export const recognizeCrudDecl: DeclCallRecognizer = (site, ctx) => {
  const facts = crudFacts(ctx)
  if (facts.features.size === 0) return undefined
  const call = crudCallee(site.callee, facts)
  if (call === undefined) return undefined
  const { feature: binding, hook } = call
  const subject = `\`${binding}.${hook}()\``
  if (!QUERY_HOOKS.has(hook) && !MUTATION_HOOKS.has(hook)) {
    // A member the feature object does not have at all is not this plugin's call to name.
    if (!UNLOWERED_HOOKS.has(hook)) return undefined
    ctx.warn(`${subject} has no native lowering — ${UNLOWERED_HOOKS.get(hook)}. ${LOWERED_HOOKS}.`)
    return null
  }
  const info = facts.features.get(binding) as CrudFeature
  if (info.refusal !== undefined || info.api === undefined || info.featureName === undefined) {
    ctx.warn(
      `${subject} does not lower to native: ${info.refusal ?? `\`${binding}\`'s \`name\` is not a string literal, so its query key cannot be built.`}`,
    )

    return null
  }
  const api = info.api
  const element: TypeIR = { kind: 'typeRef', name: featureSchemaStruct(binding), args: [] }
  facts.used.add(binding)

  if (hook === 'useList') {
    let staleMillis = 0
    const options = unwrapTypeLayers(site.args[0] as AnyNode | undefined)
    if (site.args.length > 1) {
      ctx.warn(`${subject} takes one options object; the extra arguments are not read. Pass \`{ staleTime }\` only.`)
      return null
    }
    if (options !== undefined && !isNullishLiteral(options)) {
      if (options.type !== 'ObjectExpression') {
        ctx.warn(`${subject}'s options are not an object literal, so they cannot be read at compile time — pass \`{ staleTime: 5000 }\` literally, or no options. This hook stays web.`)
        return null
      }
      for (const prop of (options.properties as AnyNode[] | undefined) ?? []) {
        const key = prop.type === 'SpreadElement' ? undefined : propName(prop)
        const value = prop.type === 'SpreadElement' ? undefined : unwrapTypeLayers(prop.value as AnyNode)
        if (key === 'staleTime' && value?.type === 'Literal' && typeof value.value === 'number' && value.value >= 0) {
          staleMillis = value.value
          continue
        }
        ctx.warn(
          key === 'staleTime'
            ? `${subject}'s \`staleTime\` is not a non-negative number literal, so it cannot be read at compile time. Write it literally (\`staleTime: 5000\`). This hook stays web.`
            : key === undefined
              ? `${subject}'s options hold a spread or a computed key, which cannot be read at compile time. This hook stays web.`
              : `${subject}'s option \`${key}\` has no native lowering — ${LIST_OPTION_REASONS.get(key) ?? 'it is not part of the lowered list surface'}. Only \`staleTime\` lowers; this hook stays web.`,
        )

        return null
      }
    }
    const payload: QueryPayload = {
      type: { kind: 'array', element },
      url: api,
      queryKey: `${info.featureName}:list`,
      staleMillis,
      // An explicit verb routes the request through `PyreonHttp`, which rejects a non-2xx answer as the web's does.
      method: 'GET',
    }

    return { type: CRUD_QUERY_TYPE, payload: payload as never }
  }

  if (hook === 'useById') {
    if (site.args.length !== 1) {
      ctx.warn(`${subject} takes exactly one argument, the id (or an accessor returning it). This hook stays web.`)
      return null
    }
    let idNode = unwrapTypeLayers(site.args[0] as AnyNode)
    if (idNode?.type === 'ArrowFunctionExpression' || idNode?.type === 'FunctionExpression') {
      const body = unwrapTypeLayers(idNode.body as AnyNode)
      if ((idNode.params as AnyNode[]).length !== 0 || body?.type === 'BlockStatement') {
        ctx.warn(`${subject}'s id accessor must be a parameterless arrow returning the id (\`() => props.id\`). This hook stays web.`)
        return null
      }
      idNode = body
    }
    if (isNullishLiteral(idNode)) {
      ctx.warn(`${subject}'s id is \`${idNode?.name ?? 'null'}\`, so the web keeps the query idle forever. Pass the id. This hook stays web.`)
      return null
    }
    const id = ctx.expr(idNode as AnyNode)
    const payload: QueryPayload & ByIdFacts = {
      type: element,
      byId: { subject: `\`${binding}.useById()\`` , id },
      urlExpr: idUrl(api, id),
      // The web keys the query `[name, id]`.
      queryKey: `${info.featureName}:`,
      queryKeyExpr: { kind: 'template', quasis: [`${info.featureName}:`, ''], exprs: [id] },
      staleMillis: 0,
      method: 'GET',
    }

    return { type: CRUD_QUERY_TYPE, payload: payload as never }
  }

  // A mutation hook. The web's hooks take no arguments.
  if (site.args.length > 0) {
    ctx.warn(`${subject} takes no arguments on the web; the ones passed are not read. Pass callbacks to \`mutate(vars, { onSuccess })\` instead. This hook stays web.`)
    return null
  }
  // A destructured mutation (`const { mutate } = Todo.useCreate()`) is bound by the core to a synthesized container
  // (`__pyDestrN`), and `mutate(vars)` then reaches no method-call recognizer: a bare call neither target declares.
  if (ctx.declName.startsWith('__pyDestr')) {
    ctx.report(
      `${subject} is destructured, and a destructured \`mutate(vars)\` is a bare call the native lowering cannot route to its request. Bind the mutation to a name: \`const ${hook === 'useCreate' ? 'create' : hook === 'useUpdate' ? 'update' : 'remove'} = ${binding}.${hook}()\`, then call \`.mutate(vars)\` on it. This hook stays web.`,
    )

    return null
  }
  const type: TypeIR = hook === 'useDelete' ? { kind: 'undefined' } : element
  facts.mutations.set(ctx.declName, { feature: binding, hook, type })
  return { type: CRUD_MUTATION_TYPE, payload: { type } as never }
}

const LIST_OPTION_REASONS: ReadonlyMap<string, string> = new Map([
  ['params', 'query parameters change the request URL and the query key, which the list lowering does not build'],
  ['page', 'a reactive page re-keys the query, which the list lowering does not build'],
  ['pageSize', 'it only applies with `page`, which does not lower'],
  ['enabled', 'the native list query has no enabled gate — it fetches on mount'],
])

/**
 * `add.mutate(vars)` / `await add.mutateAsync(vars)` on a CRUD mutation: the request the web's `http.create` /
 * `http.update` / `http.delete` sends, built from `vars` at the call site.
 */
export const recognizeCrudMutate: MethodCallRecognizer = (site, ctx) => {
  if (site.method !== 'mutate' && site.method !== 'mutateAsync') return undefined
  const receiver = site.receiver as AnyNode
  if (receiver?.type !== 'Identifier') return undefined
  const facts = crudFacts(ctx)
  const m = facts.mutations.get(receiver.name as string)
  if (m === undefined) return undefined
  const info = facts.features.get(m.feature) as CrudFeature
  const api = info.api as string
  // The web's `onSuccess`: `invalidateQueries({ queryKey: [name] })` — every query of the feature.
  const featureName = info.featureName as string
  const invalidate = { invalidates: featureName }
  const name = receiver.name as string
  const where = `\`${name}.${site.method}(…)\``
  const vars = unwrapTypeLayers(site.args[0] as AnyNode | undefined)
  if (vars === undefined || isNullishLiteral(vars)) {
    return ctx.unsupported(site.node, where, `\`${m.feature}.${m.hook}()\` needs its variables — the web sends ${m.hook === 'useCreate' ? 'them as the JSON body' : 'a request to `<api>/<id>`'}. Pass them.`)
  }
  const binding = { name, type: m.type, options: {} }
  if (m.hook === 'useCreate') {
    return mutateCallSpec(site, ctx, binding, {
      method: 'POST',
      url: api,
      headers: JSON_HEADERS,
      bodyExpr: { kind: 'json-stringify', arg: ctx.expr(vars) },
    }, invalidate)
  }
  if (m.hook === 'useDelete') {
    return mutateCallSpec(site, ctx, binding, { method: 'DELETE', url: api, urlExpr: idUrl(api, ctx.expr(vars)) }, invalidate)
  }
  // useUpdate: `{ id, data }` — read statically, because the id goes in the URL and the data in the body.
  if (vars.type !== 'ObjectExpression') {
    return ctx.unsupported(
      site.node,
      where,
      `\`${m.feature}.useUpdate()\`'s variables are \`{ id, data }\`: the id goes in the URL and the data in the body, so they are read at compile time — pass an object literal: \`${name}.${site.method}({ id, data: draft })\``,
    )
  }
  let idNode: AnyNode | undefined
  let dataNode: AnyNode | undefined
  for (const prop of (vars.properties as AnyNode[] | undefined) ?? []) {
    const key = prop.type === 'SpreadElement' ? undefined : propName(prop)
    if (key === 'id') idNode = prop.value
    else if (key === 'data') dataNode = prop.value
    else {
      return ctx.unsupported(
        site.node,
        where,
        key === undefined
          ? 'a spread or computed key in `{ id, data }` cannot be read at compile time — write both properties literally'
          : `\`${key}\` is not one of \`useUpdate()\`'s variables (\`{ id, data }\`) — the web does not send it`,
      )
    }
  }
  if (idNode === undefined || isNullishLiteral(unwrapTypeLayers(idNode)) || dataNode === undefined) {
    return ctx.unsupported(site.node, where, '`useUpdate()` needs both `id` (the URL) and `data` (the JSON body) — pass `{ id, data }`')
  }
  const id = ctx.expr(idNode)
  const optimistic = optimisticPatch(dataNode, facts.schemas.get(m.feature) ?? [], featureName, id, ctx, `\`${name}.${site.method}(…)\``)
  return mutateCallSpec(
    site,
    ctx,
    binding,
    {
      method: 'PUT',
      url: api,
      urlExpr: idUrl(api, id),
      headers: JSON_HEADERS,
      bodyExpr: { kind: 'json-stringify', arg: ctx.expr(dataNode) },
    },
    { ...invalidate, ...(optimistic !== undefined ? { optimistic } : {}) },
  )
}

const FIELD_TYPES: Readonly<Record<SchemaField['type'], TypeIR>> = {
  string: { kind: 'string' },
  number: { kind: 'number' },
  boolean: { kind: 'boolean' },
}

/**
 * The web's `onMutate` for `useUpdate`: `setQueryData([name, id], (old) => ({ ...old, ...data }))`. Natively the cached
 * record is a typed struct, so the patch is applied FIELD BY FIELD — which needs `data` to be an object literal of the
 * schema's own fields. Anything else keeps the request and the invalidation and skips only the optimistic write, NAMED.
 */
function optimisticPatch(
  dataNode: AnyNode,
  schema: readonly SchemaField[],
  featureName: string,
  id: ExprIR,
  ctx: { expr(node: AnyNode): ExprIR; report(message: string): void },
  where: string,
): MutateQueryEffects['optimistic'] {
  const skip = (why: string): undefined => {
    ctx.report(
      `${where}: ${why}, so the OPTIMISTIC write the web shows in \`useById(id)\` before the server answers is skipped natively — the request is sent, and every \`${featureName}\` query refreshes when it succeeds.`,
    )
    return undefined
  }
  const data = unwrapTypeLayers(dataNode)
  if (data?.type !== 'ObjectExpression') {
    return skip('`data` is not an object literal, so its fields cannot be read at compile time — write `data: { done: true }`')
  }
  const fields: { name: string; type: TypeIR; value: ExprIR }[] = []
  for (const prop of (data.properties as AnyNode[] | undefined) ?? []) {
    const key = prop.type === 'SpreadElement' ? undefined : propName(prop)
    if (key === undefined) return skip('`data` holds a spread or a computed key, which cannot be read at compile time')
    const field = schema.find((f) => f.name === key)
    if (field === undefined) return skip(`\`data.${key}\` is not a field of the schema's record`)
    fields.push({ name: key, type: FIELD_TYPES[field.type], value: ctx.expr(prop.value as AnyNode) })
  }
  if (fields.length === 0) return undefined
  // The web keys the record `[name, id]` — the key `useById(id)` uses natively.
  return { key: { kind: 'template', quasis: [`${featureName}:`, ''], exprs: [id] }, fields }
}

/**
 * Any OTHER call of a feature binding's generated hook outside a `const x = …` declaration (`Todo.useList().data()`,
 * a bare `Todo.useStore()` statement): named, because the declaration recognizer never saw it.
 */
export function crudCallElsewhere(
  site: { node: AnyNode; receiver: AnyNode; method: string },
  ctx: { unsupported(node: AnyNode, what: string, hint: string): null; fileState<T>(key: string, init: () => T): T },
): null | undefined {
  const receiver = site.receiver as AnyNode
  if (receiver?.type !== 'Identifier') return undefined
  const facts = crudFacts(ctx)
  if (!facts.features.has(receiver.name as string)) return undefined
  const hook = site.method
  const subject = `\`${receiver.name}.${hook}(…)\``
  if (QUERY_HOOKS.has(hook) || MUTATION_HOOKS.has(hook)) {
    return ctx.unsupported(site.node, subject, `a CRUD hook lowers only as a component declaration — bind it: \`const ${hook === 'useList' ? 'list' : hook === 'useById' ? 'item' : 'mutation'} = ${receiver.name}.${hook}(…)\``)
  }
  const why = UNLOWERED_HOOKS.get(hook)

  return why === undefined ? undefined : ctx.unsupported(site.node, subject, `${why}. ${LOWERED_HOOKS}`)
}

/** `list.data()` → `[T]?`, `list.isPending()` → `Bool`, …: what a CRUD query's reads are, for the compiler's inference. */
const ERROR_TYPE: TypeIR = { kind: 'typeRef', name: 'Error', args: [] }

function queryFieldType(decl: ExtDecl, property: string): TypeIR | undefined {
  const type = (decl.payload as unknown as QueryPayload).type
  switch (property) {
    case 'data':
      return { kind: 'union', branches: [type, { kind: 'undefined' }] }
    case 'error':
      return { kind: 'union', branches: [ERROR_TYPE, { kind: 'undefined' }] }
    case 'isPending':
    case 'isFetching':
      return { kind: 'boolean' }
    default:
      return undefined
  }
}

/** What a `useById` payload carries beyond the query's own: the id, so the emit can check it is always present. */
interface ByIdFacts {
  readonly byId?: { readonly subject: string; readonly id: ExprIR }
}

/**
 * The web keeps `useById(id)` IDLE while the id is `undefined` / `null` (`enabled: id != null`); the native query has no
 * idle gate and its URL needs the id, so an id whose type admits absence (`props.id` with `id?: string`) cannot lower.
 * Only the emit knows the id's type, so the refusal is named here.
 */
function checkById(d: ExtDecl, ctx: EmitContext): void {
  const facts = (d.payload as unknown as ByIdFacts).byId
  if (facts === undefined) return
  const t = ctx.inferType(facts.id)
  const optional =
    t.kind === 'undefined' || t.kind === 'null' || (t.kind === 'union' && t.branches.some((b) => b.kind === 'undefined' || b.kind === 'null'))
  if (!optional) return
  ctx.warnOnce(
    `Declaration ${d.name}: ${facts.subject}'s id may be absent, and the web keeps the query idle until it is set — the native query has no idle gate and its URL needs the id, so this does not compile on iOS/Android. Render the component that calls \`useById\` only once the id exists (\`<Show when={() => props.id}>\`) and pass it a non-optional id.`,
  )
}

export const crudDecls: Readonly<Record<string, DeclEmitter>> = Object.freeze({
  [CRUD_QUERY_TYPE]: {
    ...queryContainerDecl,
    swift(d, ctx) {
      checkById(d, ctx)
      return queryContainerDecl.swift(d, ctx)
    },
    kotlin(d, ctx) {
      checkById(d, ctx)
      return queryContainerDecl.kotlin(d, ctx)
    },
    typing: { callRead: queryFieldType },
  },
  [CRUD_MUTATION_TYPE]: mutationDecl,
})

export const crudReceivers: Readonly<Record<string, ReceiverLowering>> = Object.freeze({
  [CRUD_QUERY_TYPE]: queryReceiver,
  [CRUD_MUTATION_TYPE]: mutationReceiver,
})

export const crudExprs: Readonly<Record<string, ExprEmitter>> = Object.freeze({
  [MUTATE_TYPE]: mutateExpr,
  [MUTATE_ASYNC_TYPE]: mutateAsyncExpr,
})

/** Every feature a lowered hook used must have lowered its declaration too, or the emit names a struct nobody declared. */
export function finishCrud(
  items: readonly { plugin: string; type: string; name: string }[],
  plugin: string,
  itemType: string,
  report: (message: string) => void,
  facts: CrudFacts,
): void {
  for (const binding of facts.used) {
    if (items.some((i) => i.plugin === plugin && i.type === itemType && i.name === binding)) continue
    report(
      `\`${binding}\`'s CRUD hooks lowered, but its \`defineFeature\` declaration did not (see the warning above), so \`${featureSchemaStruct(binding)}\` is not declared and the hooks cannot compile on iOS/Android. Fix the declaration's schema.`,
    )
  }
}
