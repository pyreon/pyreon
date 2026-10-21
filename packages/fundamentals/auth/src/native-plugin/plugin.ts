// How `@pyreon/auth` crosses to native: `useOidc(…)` lowers to the native OIDC session container.
//
//   const auth = useOidc({ issuer, clientId, redirectUri, nativeRedirectUri?, scope?,
//                          postLogoutRedirectUri?, authorizationParams? })
//     iOS     → @State private var auth = PyreonOidcAuth(issuer: …, clientId: …, redirectUri: …)
//     Android → val auth = rememberPyreonOidcAuth(issuer = …, clientId = …, redirectUri = …)
//
// The containers run the whole flow natively (discovery, PKCE, the system browser, the code
// exchange, ID-token verification, refresh, logout) and keep the session in the Keychain /
// Keystore. The web reads every member as a CALL (`auth.status()`); natively they are
// properties (Kotlin: Compose state, read `.value`), so the parentheses drop here.
//
// The config must be STATIC: it is baked into the native initialiser. A value only known at
// runtime is reported by name and the declaration is claimed without emitting — a half-baked
// container that signs in against the wrong issuer is worse than a compile error.

import {
  kotlinStr,
  swiftStr,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type ExprIR,
  type ExtDecl,
  type KotlinEmitContext,
  type ReceiverLowering,
  type ReceiverSite,
  type SwiftEmitContext,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { authStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const AUTH_PLUGIN_NAME = '@pyreon/auth'
const DECL_TYPE = 'oidc'

interface OidcPayload {
  readonly issuer: string
  readonly clientId: string
  readonly redirectUri: string
  readonly scope?: string
  readonly postLogoutRedirectUri?: string
  readonly authorizationParams?: Readonly<Record<string, string>>
}

/** Options whose meaning is web-only: the native runtime supplies its own store, browser and transport. */
const WEB_ONLY_OPTIONS = new Set(['flows', 'redirect', 'fetch'])
const STRING_OPTIONS = ['issuer', 'clientId', 'redirectUri', 'nativeRedirectUri', 'scope', 'postLogoutRedirectUri'] as const
const RESERVED_PARAMS = new Set(['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'nonce', 'code_challenge', 'code_challenge_method'])

const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]'

/** Same rule as the runtime's `assertHttps`, applied at compile time so a bad issuer fails the build, not the sign-in. */
function issuerProblem(issuer: string): string | undefined {
  let u: URL
  try {
    u = new URL(issuer)
  } catch {
    return 'is not a valid URL'
  }
  if (u.protocol === 'https:' || (u.protocol === 'http:' && isLoopback(u.hostname))) return undefined
  return `must be https (got ${u.protocol})`
}

const recognizeOidc: CallRecognizer = (_call, ctx) => {
  const arg = ctx.unwrap(ctx.resolveStatic(ctx.args[0] as AnyNode | undefined)) as AnyNode
  const where = `useOidc declaration \`${ctx.declName}\``
  if (!arg || arg.type !== 'ObjectExpression') {
    ctx.report(`${where}: the options must be an object literal — the native session container is configured at compile time.`)
    return null
  }
  const strings: Record<string, string> = {}
  let params: Record<string, string> | undefined
  const problems: string[] = []
  for (const prop of (arg.properties as AnyNode[]) ?? []) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') {
      problems.push('a spread in the options cannot be read at compile time')
      continue
    }
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `${where}: options`)
      continue
    }
    const key = ctx.propKey(prop)
    if (key === undefined || WEB_ONLY_OPTIONS.has(key)) continue
    if ((STRING_OPTIONS as readonly string[]).includes(key)) {
      const v = ctx.staticString(prop.value)
      if (v === null) problems.push(`\`${key}\` must be a string literal (or a module-level const holding one)`)
      else strings[key] = v
      continue
    }
    if (key === 'authorizationParams') {
      const obj = ctx.unwrap(ctx.resolveStatic(prop.value)) as AnyNode
      if (!obj || obj.type !== 'ObjectExpression') {
        problems.push('`authorizationParams` must be an object literal of strings')
        continue
      }
      params = {}
      for (const p of (obj.properties as AnyNode[]) ?? []) {
        const k = ctx.propKey(p)
        const v = p.value ? ctx.staticString(p.value) : null
        if (k === undefined || v === null || ctx.hasDynamicKey(p)) {
          problems.push('every `authorizationParams` entry must be a static string')
          continue
        }
        if (RESERVED_PARAMS.has(k)) problems.push(`\`authorizationParams\` cannot set "${k}" — it is managed by the flow`)
        else params[k] = v
      }
      continue
    }
    problems.push(`\`${key}\` is not a useOidc option`)
  }
  for (const required of ['issuer', 'clientId', 'redirectUri'] as const) {
    if (strings[required] === undefined && !problems.some((p) => p.startsWith(`\`${required}\``))) {
      problems.push(`\`${required}\` is required`)
    }
  }
  if (strings.issuer !== undefined) {
    const bad = issuerProblem(strings.issuer)
    if (bad) problems.push(`\`issuer\` ${bad}`)
  }
  if (problems.length > 0) {
    ctx.report(`${where}: ${problems.join('; ')}. The native session container is not emitted.`)
    return null
  }
  const payload: OidcPayload = {
    issuer: strings.issuer!,
    clientId: strings.clientId!,
    // A native app cannot receive a redirect to the web page; it needs its own scheme or claimed link.
    redirectUri: strings.nativeRedirectUri ?? strings.redirectUri!,
    ...(strings.scope === undefined ? {} : { scope: strings.scope }),
    ...(strings.postLogoutRedirectUri === undefined ? {} : { postLogoutRedirectUri: strings.postLogoutRedirectUri }),
    ...(params === undefined || Object.keys(params).length === 0 ? {} : { authorizationParams: params }),
  }
  if (strings.nativeRedirectUri === undefined && /^https?:/i.test(strings.redirectUri!)) {
    ctx.warn(
      `useOidc: no \`nativeRedirectUri\`, so the native apps use the web \`redirectUri\` (${strings.redirectUri}). An https redirect only returns to the app when it is a claimed universal link / App Link; otherwise set \`nativeRedirectUri\` to your app's scheme (\`com.example.app:/oauth\`) and register it with the provider.`,
    )
  }
  return { type: DECL_TYPE, payload: payload as unknown as Record<string, never> }
}

const payloadOf = (d: ExtDecl): OidcPayload => d.payload as unknown as OidcPayload

const oidcDecl: DeclEmitter = {
  swift(d, ctx) {
    const p = payloadOf(d)
    const args = [`issuer: ${swiftStr(p.issuer)}`, `clientId: ${swiftStr(p.clientId)}`, `redirectUri: ${swiftStr(p.redirectUri)}`]
    if (p.scope !== undefined) args.push(`scope: ${swiftStr(p.scope)}`)
    if (p.postLogoutRedirectUri !== undefined) args.push(`postLogoutRedirectUri: ${swiftStr(p.postLogoutRedirectUri)}`)
    if (p.authorizationParams !== undefined) {
      const entries = Object.entries(p.authorizationParams).map(([k, v]) => `${swiftStr(k)}: ${swiftStr(v)}`)
      args.push(`authorizationParams: [${entries.join(', ')}]`)
    }
    return `@State private var ${ctx.ident(d.name)} = PyreonOidcAuth(${args.join(', ')})`
  },
  kotlin(d, ctx) {
    const p = payloadOf(d)
    const args = [`issuer = ${kotlinStr(p.issuer)}`, `clientId = ${kotlinStr(p.clientId)}`, `redirectUri = ${kotlinStr(p.redirectUri)}`]
    if (p.scope !== undefined) args.push(`scope = ${kotlinStr(p.scope)}`)
    if (p.postLogoutRedirectUri !== undefined) args.push(`postLogoutRedirectUri = ${kotlinStr(p.postLogoutRedirectUri)}`)
    if (p.authorizationParams !== undefined) {
      const entries = Object.entries(p.authorizationParams).map(([k, v]) => `${kotlinStr(k)} to ${kotlinStr(v)}`)
      args.push(`authorizationParams = mapOf(${entries.join(', ')})`)
    }
    return `val ${ctx.ident(d.name)} = rememberPyreonOidcAuth(${args.join(', ')})`
  },
  typing: {
    callRead: (_d, property) => FIELD_TYPES[property],
    member: (_d, property) => FIELD_TYPES[property],
    methodReturn: (_d, method) => (method === 'claim' ? NULLABLE_STRING : FIELD_TYPES[method]),
  },
}

const NULLABLE_STRING: TypeIR = { kind: 'union', branches: [{ kind: 'string' }, { kind: 'null' }] }

/** Members the web reads as calls and the containers hold as properties, with their types. */
const FIELD_TYPES: Readonly<Record<string, TypeIR>> = {
  status: { kind: 'string' },
  isAuthenticated: { kind: 'boolean' },
  subject: NULLABLE_STRING,
  accessToken: NULLABLE_STRING,
  error: NULLABLE_STRING,
  expiresAt: { kind: 'union', branches: [{ kind: 'number', float: true }, { kind: 'null' }] },
}
/** Of those, the ones that are Compose state on Android (`isAuthenticated` is a plain getter). */
const KOTLIN_STATE = new Set(['status', 'subject', 'accessToken', 'error', 'expiresAt'])

/** `auth.<field>()` (the web read) or `auth.<field>` (a native-style read) of a known field. */
function fieldOf(site: ReceiverSite): string | undefined {
  if (site.kind === 'call') {
    const callee = site.expr.callee
    if (site.expr.args.length !== 0 || callee.kind !== 'member' || callee.object.kind !== 'identifier') return undefined
    return callee.property in FIELD_TYPES ? callee.property : undefined
  }
  if (site.expr.object.kind !== 'identifier') return undefined
  return site.expr.property in FIELD_TYPES ? site.expr.property : undefined
}

/**
 * `auth.signOut({ endProviderSession: true })` → a labelled argument. Native configures the
 * post-logout redirect once, at creation, so a per-call `postLogoutRedirectUri` is reported
 * rather than silently dropped.
 */
function signOutCall(site: ReceiverSite, ctx: SwiftEmitContext | KotlinEmitContext, swift: boolean): string | undefined {
  if (site.kind !== 'call' || site.expr.callee.kind !== 'member' || site.expr.callee.property !== 'signOut') return undefined
  const name = ctx.ident(site.receiver.name)
  const arg = site.expr.args[0]
  if (arg === undefined) return `${name}.signOut()`
  if (site.expr.args.length !== 1 || arg.kind !== 'object') {
    ctx.warn(`${site.receiver.name}.signOut(…): pass an object literal \`{ endProviderSession: true }\` — anything else cannot be read at compile time.`)
    return undefined
  }
  let end: string | undefined
  for (const f of (arg as Extract<ExprIR, { kind: 'object' }>).fields) {
    if (f.name === 'endProviderSession') end = ctx.expr(f.value)
    else {
      ctx.warn(
        `${site.receiver.name}.signOut({ ${f.name} }): native sessions take \`postLogoutRedirectUri\` once, in the useOidc options — set it there.`,
      )
      return undefined
    }
  }
  if (end === undefined) return `${name}.signOut()`
  return swift ? `${name}.signOut(endProviderSession: ${end})` : `${name}.signOut(endProviderSession = ${end})`
}

const oidcReceiver: ReceiverLowering = {
  swift: {
    expr(site, ctx) {
      const field = fieldOf(site)
      if (field !== undefined) return `${ctx.ident(site.receiver.name)}.${field}`
      return signOutCall(site, ctx, true)
    },
  },
  kotlin: {
    expr(site, ctx) {
      const field = fieldOf(site)
      if (field !== undefined) {
        return `${ctx.ident(site.receiver.name)}.${ctx.ident(field)}${KOTLIN_STATE.has(field) ? '.value' : ''}`
      }
      return signOutCall(site, ctx, false)
    },
  },
}

/**
 * The `@pyreon/auth` native plugin. Shipped by the package itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports `@pyreon/auth`.
 */
export const authPlugin: CompilerPlugin = Object.freeze({
  name: AUTH_PLUGIN_NAME,
  apiVersion: 2,
  modules: Object.freeze([AUTH_PLUGIN_NAME]),
  calls: Object.freeze({ useOidc: recognizeOidc }),
  componentOnlyCalls: Object.freeze(['useOidc']),
  decls: Object.freeze({ [DECL_TYPE]: oidcDecl }),
  receivers: Object.freeze({ [DECL_TYPE]: oidcReceiver }),
  runtimeTypes: Object.freeze(['PyreonOidcAuth']),
  unlowered: Object.freeze({
    [AUTH_PLUGIN_NAME]: Object.freeze({
      supported: Object.freeze(['useOidc']),
      advice:
        '`useOidc({ issuer, clientId, redirectUri, nativeRedirectUri })` DOES lower — to the native OIDC session (system browser, PKCE, ID-token verification, Keychain/Keystore persistence). The lower-level web API (createAuth, discover, exchangeCode, sessions, TOTP, passkeys) is server/web code and stays web',
    }),
  }),
  stubs: authStubs,
})
