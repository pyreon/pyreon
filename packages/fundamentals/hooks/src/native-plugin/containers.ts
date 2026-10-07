// The stateful native containers `@pyreon/hooks` lowers beyond the plain-service table: each is a hook that holds one runtime
// object for the component's lifetime, but also needs code — an argument read, labelled Swift calls, an object literal lowered
// to a nominal record, a typed generic, or a typed optional on a member or a method's return.
//
//   useWebSocket('wss://…')  → PyreonWebSocket     (the url is baked into `connect()`; a mount-time connect is synthesized)
//   useDatabase()            → PyreonDatabase      (`insert('c', { id, fields })` → PyreonRecord; labelled Swift `get`/`delete`/`find`)
//   useSecureStorage()       → PyreonSecureStorage (labelled Swift calls; `read` is optional)
//   useMap()                 → PyreonMapState      (labelled Swift `moveTo` / `removeMarker`; `selectedMarkerId` is optional)
//   useAuth<User>()          → PyreonAuth<User>    (a typed generic; `error` is optional)
//
// Swift containers are `@Observable` (properties read bare); Compose containers hold `MutableState` (a field read appends
// `.value`). The web reads these fields as signal CALLS (`ws.lastMessage()`), so both targets drop the call parentheses.

import {
  kotlinStr,
  swiftStr,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type DeclIR,
  type EmitPreparation,
  type ExprIR,
  type ExtDecl,
  type KotlinEmitContext,
  type ReceiverLowering,
  type ReceiverSite,
  type SwiftEmitContext,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'

export const WEBSOCKET_TYPE = 'websocket'
export const DATABASE_TYPE = 'database'
export const SECURE_STORAGE_TYPE = 'secureStorage'
export const MAP_TYPE = 'map'
export const AUTH_TYPE = 'auth'

const PLUGIN_NAME = '@pyreon/hooks'

/** A native `Error` — what a container's `error` field holds on both runtimes (and on the web). */
const ERROR_OBJECT: TypeIR = { kind: 'typeRef', name: 'Error', args: [] }
const nullable = (t: TypeIR): TypeIR => ({ kind: 'union', branches: [t, { kind: 'null' }] })

const WEBSOCKET_FIELDS: ReadonlySet<string> = new Set(['lastMessage', 'messages', 'isConnected', 'error'])
const MAP_FIELDS: ReadonlySet<string> = new Set(['camera', 'markers', 'selectedMarkerId'])
const AUTH_FIELDS: ReadonlySet<string> = new Set(['status', 'user', 'error'])

const urlOf = (d: ExtDecl): string => (d.payload as { url: string }).url

// ---------------------------------------------------------------------------------------------------------------------
// recognizers
// ---------------------------------------------------------------------------------------------------------------------

/** `useWebSocket('wss://…')`: the url must be a string literal so it can be baked into the emitted connect call. */
export const recognizeWebSocket: CallRecognizer = (_call, ctx) => {
  const url = ctx.stringLiteralArg(0)
  if (url === undefined) {
    ctx.warn(`useWebSocket url argument must be a string literal; got ${(ctx.args[0] as { type?: string } | undefined)?.type ?? 'nothing'}.`)
    return null
  }
  return { type: WEBSOCKET_TYPE, payload: { url } }
}
export const recognizeDatabase: CallRecognizer = () => ({ type: DATABASE_TYPE })
export const recognizeSecureStorage: CallRecognizer = () => ({ type: SECURE_STORAGE_TYPE })
export const recognizeMap: CallRecognizer = () => ({ type: MAP_TYPE })
/** `useAuth<User>()`: generic over the app's user type. The no-generic form falls back to a placeholder type the emit handles. */
export const recognizeAuth: CallRecognizer = (_call, ctx) => ({
  type: AUTH_TYPE,
  payload: { userType: ctx.typeArg() } as unknown as Record<string, never>,
})

// ---------------------------------------------------------------------------------------------------------------------
// declarations
// ---------------------------------------------------------------------------------------------------------------------

const kotlinCtxDecl = (d: ExtDecl, ctx: { ident(name: string): string }, container: string): readonly string[] => {
  const id = ctx.ident(d.name)
  return [`val ${id}Ctx = LocalContext.current`, `val ${id} = remember { ${container}(${id}Ctx) }`]
}

export const websocketDecl: DeclEmitter = {
  legacyKind: 'websocket',
  swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = PyreonWebSocket()`,
  kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { PyreonWebSocket() }`,
  typing: { member: (_d, property) => (property === 'lastMessage' ? nullable({ kind: 'string' }) : property === 'error' ? nullable(ERROR_OBJECT) : undefined) },
}

export const databaseDecl: DeclEmitter = {
  legacyKind: 'database',
  swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = PyreonDatabase()`,
  // `PyreonDatabase(context)` — NOT the bare `PyreonDatabase()` this emitted until 2026-07: the bare form resolved to the in-memory
  // backend, so a `useDatabase()` app lost every record on relaunch, silently. Android needs a Context to find app-private storage,
  // so it is threaded here exactly as `useNativeModule` does. (Swift needs no equivalent: Foundation resolves Application Support
  // unaided, so `PyreonDatabase()` persists there on its own.)
  kotlin: (d, ctx) => kotlinCtxDecl(d, ctx, 'PyreonDatabase'),
  // `db.get(collection, id)` returns an optional RECORD on both runtimes, which makes the most common database shape — read a row,
  // branch on whether it exists — fail on both targets without this ("optional type cannot be used as a boolean"). The branch is
  // `unknown`, not a record type: the condition lowering only needs the type to be OPTIONAL.
  typing: { methodReturn: (_d, method) => (method === 'get' ? nullable({ kind: 'unknown' }) : undefined) },
}

export const secureStorageDecl: DeclEmitter = {
  legacyKind: 'secureStorage',
  // Keychain-backed default (`KeychainSecureBackend`) — persists across relaunches on its own; no Context equivalent on iOS.
  swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = PyreonSecureStorage()`,
  // `PyreonSecureStorage(context)` — the KeystoreSecureBackend factory (AndroidKeyStore AES-GCM over app-private storage). A bare
  // constructor deliberately does not exist: a secret store must never silently fall back to memory.
  kotlin: (d, ctx) => kotlinCtxDecl(d, ctx, 'PyreonSecureStorage'),
  // `PyreonSecureStorage.read` is `String?` on both targets: typed so `if (token) { … }` classifies for the optional-condition lowering.
  typing: { methodReturn: (_d, method) => (method === 'read' ? nullable({ kind: 'string' }) : undefined) },
}

export const mapDecl: DeclEmitter = {
  legacyKind: 'map',
  swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = PyreonMapState()`,
  kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { PyreonMapState() }`,
  // No `error`: `PyreonMapState` holds camera / markers / selection, performs no I/O and cannot fail.
  typing: { member: (_d, property) => (property === 'selectedMarkerId' ? nullable({ kind: 'string' }) : undefined) },
}

export const authDecl: DeclEmitter = {
  legacyKind: 'auth',
  swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = PyreonAuth<${ctx.typeText((d.payload as unknown as { userType: TypeIR }).userType)}>()`,
  kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { PyreonAuth<${ctx.typeText((d.payload as unknown as { userType: TypeIR }).userType)}>() }`,
  // `error: Error?` on Swift and `Throwable?` on Kotlin: `{auth.error}` compiled and rendered `Optional("boom")` at runtime, and the
  // `{auth.error ?? ''}` an author would reach for does NOT compile.
  typing: { member: (_d, property) => (property === 'error' ? nullable(ERROR_OBJECT) : undefined) },
}

// ---------------------------------------------------------------------------------------------------------------------
// receivers
// ---------------------------------------------------------------------------------------------------------------------

/** The property of an exact `<binding>.<prop>()` call or `<binding>.<prop>` read on the receiver, or `undefined`. */
function fieldOf(site: ReceiverSite, fields: ReadonlySet<string>): string | undefined {
  if (site.kind === 'call') {
    const callee = site.expr.callee
    if (site.expr.args.length !== 0 || callee.kind !== 'member' || callee.object.kind !== 'identifier') return undefined
    return fields.has(callee.property) ? callee.property : undefined
  }
  const read = site.expr
  if (read.object.kind !== 'identifier') return undefined
  return fields.has(read.property) ? read.property : undefined
}

/** A zero-argument `<binding>.<method>()` call, or `undefined`. */
const zeroArgMethodOf = (site: ReceiverSite): string | undefined => {
  if (site.kind !== 'call' || site.expr.args.length !== 0 || site.expr.callee.kind !== 'member') return undefined
  return site.expr.callee.property
}

/** The method of a `<binding>.<method>(…args)` call, or `undefined`. */
const methodOf = (site: ReceiverSite): string | undefined =>
  site.kind === 'call' && site.expr.callee.kind === 'member' && site.expr.callee.object.kind === 'identifier' ? site.expr.callee.property : undefined

/**
 * The Swift signature LABELS arguments the shared TS surface passes positionally (`db.delete('tx', id)` → `delete("tx", id: id)`;
 * `swiftc -parse` waves the positional form through, so it shipped unnoticed until the emit was type-checked). Kotlin needs no
 * equivalent: named arguments are optional there. `null` = that position is unlabelled.
 */
type Labels = Readonly<Record<string, readonly (string | null)[]>>

/** Labels cover EVERY argument position. `<=`, not `===`: a defaulted trailing parameter (`moveTo`'s `zoom`) makes several arities legal. */
function labelledCall(site: ReceiverSite, ctx: SwiftEmitContext, labels: Labels, exactAfterCollection = false): string | undefined {
  const method = methodOf(site)
  if (method === undefined || site.kind !== 'call') return undefined
  const table = labels[method]
  if (table === undefined) return undefined
  const args = site.expr.args
  // The database's table lists the labels AFTER its leading unlabelled collection, and only rewrites when the arity matches the
  // declared surface exactly; anything else falls through to the generic emit so a genuinely wrong call still surfaces as a
  // compiler error rather than being papered over.
  if (exactAfterCollection ? args.length !== table.length + 1 : args.length > table.length) return undefined
  const labelled = args.map((a, i) => {
    const src = ctx.expr(a)
    const label = exactAfterCollection ? (i === 0 ? null : table[i - 1]) : table[i]
    return label === null || label === undefined ? src : `${label}: ${src}`
  })
  return `${ctx.ident(site.receiver.name)}.${method}(${labelled.join(', ')})`
}

const DATABASE_LABELS: Labels = { get: ['id'], delete: ['id'], find: ['field', 'equals'] }
const SECURE_STORAGE_LABELS: Labels = { write: ['key', 'value'], read: ['key'], remove: ['key'], contains: ['key'] }
const MAP_LABELS: Labels = { moveTo: ['latitude', 'longitude', 'zoom'], removeMarker: ['id'] }

/**
 * `db.insert('todos', { id, fields })` is the primary write, and the object literal was lowered by the generic path into an
 * anonymous TUPLE (Swift) / invalid expression (Kotlin) — not a `PyreonRecord`, so the call never compiled. Field values are
 * emitted AS WRITTEN: `fields` is a `[String: String]`, and silently wrapping a number would hide a real mistake behind a coercion.
 * Anything but the `{ id, fields }` shape warns (no struct synthesized can satisfy a nominal parameter) and falls through.
 */
function insertRecord(site: ReceiverSite, ctx: SwiftEmitContext | KotlinEmitContext, swift: boolean): string | undefined {
  if (methodOf(site) !== 'insert' || site.kind !== 'call') return undefined
  const args = site.expr.args
  if (args.length !== 2 || args[1]?.kind !== 'object') return undefined
  const lit = args[1] as Extract<ExprIR, { kind: 'object' }>
  const idField = lit.fields.find((f) => f.name === 'id')
  const fieldsField = lit.fields.find((f) => f.name === 'fields')
  const unknown = lit.fields.filter((f) => f.name !== 'id' && f.name !== 'fields')
  if (idField && unknown.length === 0) {
    const parts = [swift ? `id: ${ctx.expr(idField.value)}` : ctx.expr(idField.value)]
    if (fieldsField) {
      if (fieldsField.value.kind === 'object') {
        const entries = fieldsField.value.fields
          .map((f) => (swift ? `${swiftStr(f.name)}: ${ctx.expr(f.value)}` : `${kotlinStr(f.name)} to ${ctx.expr(f.value)}`))
          .join(', ')
        parts.push(swift ? `fields: [${entries === '' ? ':' : entries}]` : entries === '' ? 'emptyMap()' : `mapOf(${entries})`)
      } else {
        // A variable holding the dictionary — pass it through.
        parts.push(swift ? `fields: ${ctx.expr(fieldsField.value)}` : ctx.expr(fieldsField.value))
      }
    }
    return `${ctx.ident(site.receiver.name)}.insert(${ctx.expr(args[0]!)}, PyreonRecord(${parts.join(', ')}))`
  }
  warnInsertShape(ctx, site.receiver.name, lit.fields)
  return undefined
}

function warnInsertShape(ctx: SwiftEmitContext | KotlinEmitContext, dbName: string, fields: { name: string; value: ExprIR }[]): void {
  const hasId = fields.some((f) => f.name === 'id')
  const unknown = fields.filter((f) => f.name !== 'id' && f.name !== 'fields')
  const given = fields.map((f) => f.name).join(', ') || '(empty)'
  const reasons: string[] = []
  if (!hasId) reasons.push('no `id` field')
  if (unknown.length > 0) {
    const names = unknown.map((f) => `\`${f.name}\``).join(', ')
    const plural = unknown.length === 1 ? ['is', 'it'] : ['are', 'them']
    reasons.push(`${names} ${plural[0]} not \`id\`/\`fields\` — nest ${plural[1]} under \`fields: { ... }\``)
  }
  ctx.warn(
    `${dbName}.insert(...) argument { ${given} } is not the { id, fields } shape 'PyreonRecord' requires ` +
      `(${reasons.join('; ')}). No struct synthesized here can satisfy insert's PyreonRecord parameter — ` +
      `Swift/Kotlin are nominally typed, so this will NOT compile. Write ` +
      `\`db.insert(collection, { id, fields: { ...columns } })\`.`,
  )
}

export const websocketReceiver: ReceiverLowering = {
  swift: {
    // `ws.isConnected()` etc. are web signal READS; the Swift runtime declares them as PROPERTIES, so the call parens go.
    // `ws.connect()` — the TS hook surface is 0-arg (the url is baked); the Swift runtime's signature is `connect(to: URL)`.
    expr(site, ctx) {
      if (site.kind !== 'call') return undefined
      const field = fieldOf(site, WEBSOCKET_FIELDS)
      if (field !== undefined) return `${ctx.ident(site.receiver.name)}.${field}`
      if (zeroArgMethodOf(site) === 'connect') return `${ctx.ident(site.receiver.name)}.connect(to: URL(string: ${swiftStr(urlOf(site.receiver))})!)`
      return undefined
    },
  },
  kotlin: {
    // Compose `MutableState` fields read `.value` in call AND member form; `ws.connect()` → the OkHttp transport extension
    // `PyreonWebSocket.connect(url)` shipped in `@pyreon/native-runtime-kotlin`, threading the registered url.
    expr(site, ctx) {
      const field = fieldOf(site, WEBSOCKET_FIELDS)
      if (field !== undefined) return `${ctx.ident(site.receiver.name)}.${ctx.ident(field)}.value`
      if (zeroArgMethodOf(site) === 'connect') return `${ctx.ident(site.receiver.name)}.connect(${kotlinStr(urlOf(site.receiver))})`
      return undefined
    },
  },
}

export const databaseReceiver: ReceiverLowering = {
  swift: { expr: (site, ctx) => insertRecord(site, ctx, true) ?? labelledCall(site, ctx, DATABASE_LABELS, true) },
  kotlin: { expr: (site, ctx) => insertRecord(site, ctx, false) },
}

export const secureStorageReceiver: ReceiverLowering = {
  swift: { expr: (site, ctx) => labelledCall(site, ctx, SECURE_STORAGE_LABELS) },
}

const stateFieldsReceiver = (fields: ReadonlySet<string>, labels?: Labels): ReceiverLowering => ({
  ...(labels === undefined ? {} : { swift: { expr: (site: ReceiverSite, ctx: SwiftEmitContext) => labelledCall(site, ctx, labels) } }),
  kotlin: {
    expr(site, ctx) {
      const field = fieldOf(site, fields)
      return field === undefined ? undefined : `${ctx.ident(site.receiver.name)}.${ctx.ident(field)}.value`
    },
  },
})
export const mapReceiver = stateFieldsReceiver(MAP_FIELDS, MAP_LABELS)
export const authReceiver = stateFieldsReceiver(AUTH_FIELDS)

// ---------------------------------------------------------------------------------------------------------------------
// the implicit connect
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The web `useWebSocket(url)` auto-connects; the native container is created but never connects unless the author writes
 * `onMount(() => ws.connect())`. For each socket with NO explicit `.connect()` call anywhere in its component, append a synthetic
 * `on-mount` declaration calling `ws.connect()` — which reuses the whole mount harness (SwiftUI `.onAppear` on the stable host,
 * Compose `LaunchedEffect(Unit)`) and the url-threading receiver above. Skips a socket that already has an explicit connect (no
 * double-connect). Idempotent: a socket that already owns a synthetic on-mount connect is not re-appended.
 */
export const connectOnMount: EmitPreparation = (input) => {
  for (const c of input.components) {
    const wsNames = c.decls.filter((d) => d.kind === 'ext' && d.plugin === PLUGIN_NAME && d.type === WEBSOCKET_TYPE).map((d) => (d as ExtDecl).name)
    if (wsNames.length === 0) continue
    // Names that ALREADY have an explicit `.connect()` call anywhere in the component IR (decls + return tree): a generic recursive
    // walk — find a `call` whose callee is `member(identifier(ws), 'connect')`.
    const explicit = new Set<string>()
    const visit = (n: unknown): void => {
      if (Array.isArray(n)) {
        for (const x of n) visit(x)
        return
      }
      if (n === null || typeof n !== 'object') return
      const node = n as Record<string, unknown> & { kind?: string }
      if (node.kind === 'call') {
        const callee = node.callee as { kind?: string; object?: { kind?: string; name?: string }; property?: string } | undefined
        if (
          callee?.kind === 'member' &&
          callee.property === 'connect' &&
          callee.object?.kind === 'identifier' &&
          typeof callee.object.name === 'string' &&
          wsNames.includes(callee.object.name)
        ) {
          explicit.add(callee.object.name)
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'kind') continue
        visit(node[key])
      }
    }
    visit(c.decls)
    visit(c.returnExpr)
    for (const name of wsNames) {
      if (explicit.has(name)) continue
      const connect: DeclIR = {
        kind: 'on-mount',
        body: [
          {
            kind: 'expr',
            expr: { kind: 'call', callee: { kind: 'member', object: { kind: 'identifier', name }, property: 'connect' }, args: [] },
          },
        ],
      }
      c.decls.push(connect)
    }
  }
}

/** The container lowerings as the pieces a plugin spreads into its members. */
export const containerPlugin = {
  calls: {
    useWebSocket: recognizeWebSocket,
    useDatabase: recognizeDatabase,
    useSecureStorage: recognizeSecureStorage,
    useMap: recognizeMap,
    useAuth: recognizeAuth,
  },
  destructureCalls: ['useWebSocket', 'useSecureStorage', 'useDatabase', 'useMap', 'useAuth'],
  decls: {
    [WEBSOCKET_TYPE]: websocketDecl,
    [DATABASE_TYPE]: databaseDecl,
    [SECURE_STORAGE_TYPE]: secureStorageDecl,
    [MAP_TYPE]: mapDecl,
    [AUTH_TYPE]: authDecl,
  },
  receivers: {
    [WEBSOCKET_TYPE]: websocketReceiver,
    [DATABASE_TYPE]: databaseReceiver,
    [SECURE_STORAGE_TYPE]: secureStorageReceiver,
    [MAP_TYPE]: mapReceiver,
    [AUTH_TYPE]: authReceiver,
  },
  prepareEmit: connectOnMount,
} satisfies Pick<CompilerPlugin, 'calls' | 'destructureCalls' | 'decls' | 'receivers' | 'prepareEmit'>
