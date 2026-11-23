import { batch, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import {
  AuthError,
  FLOW_TTL_MS,
  beginAuthorization,
  discover,
  endSessionUrl,
  exchangeCode,
  flowKey,
  parseCallback,
  redirectTarget,
  refreshTokens,
} from './oidc'
import type { ClientConfig, FetchLike, OidcMetadata, PendingFlow, TokenResponse } from './oidc'
import { createJwksCache, verifyIdToken } from './jwt'
import type { IdTokenClaims, JwksCache, JwksCacheOptions } from './jwt'

export type AuthStatus = 'signedOut' | 'signingIn' | 'signedIn' | 'error'

/**
 * Where a `PendingFlow` lives across the redirect. Must NOT be `localStorage`.
 *
 * Keys are opaque and computed by `@pyreon/auth` from the `state` AND the flow's owner (issuer,
 * client id, redirect URI) AND the browser binding. A store only maps keys to flows: another
 * provider's instance, or another browser presenting the same `state`, asks for a different key
 * and gets `null`, without touching the flow.
 */
export interface FlowStore {
  save(key: string, flow: PendingFlow): void | Promise<void>
  /** Read AND delete in one atomic step (Redis `GETDEL`): a flow is single-use. */
  take(key: string): PendingFlow | null | Promise<PendingFlow | null>
  /**
   * True only for a store private to one browser tab (`sessionStorageFlowStore`): nothing outside
   * the tab can read or write it, so it binds flows to the browser by itself and `createAuth`
   * needs no `binding`. Never set this on a store shared between users.
   */
  readonly tabScoped?: boolean
}

export interface AuthOptions {
  /** OIDC issuer (discovery). Omit when passing `metadata`. */
  issuer?: string
  /** Explicit endpoints for non-OIDC OAuth2 providers (github, facebook). */
  metadata?: OidcMetadata
  client: ClientConfig
  flows: FlowStore
  /**
   * Ties each pending sign-in to the browser that started it (login-CSRF defence). On a server:
   * `createFlowBinding(cookieHeader).value` when the sign-in starts (send its `setCookie`), and
   * `readFlowBinding(cookieHeader)` on the callback. Required unless `flows` is tab-scoped
   * (`sessionStorageFlowStore`); `useOidc` supplies it itself.
   */
  binding?: string | null | undefined
  /** Navigate the user agent to the provider. */
  redirect: (url: string) => void
  fetch?: FetchLike
  /** JWKS cache tuning (key-set max age, re-fetch throttle on an unknown `kid`). */
  jwks?: JwksCacheOptions
}

export interface SignOutOptions {
  /**
   * Also end the session AT THE PROVIDER (RP-initiated logout) by redirecting to its
   * `end_session_endpoint`. Without it only local state is cleared, and the next
   * sign-in completes silently because the provider still has a session.
   * Ignored when the provider advertises no end-session endpoint.
   */
  endProviderSession?: boolean
  /** Where the provider sends the user afterwards (must be registered with it). */
  postLogoutRedirectUri?: string
}

export interface Auth {
  status: Signal<AuthStatus>
  tokens: Signal<TokenResponse | null>
  /**
   * The ID token's claims — set only after the token's signature (against the
   * provider's published JWKS), `iss`, `aud`, expiry and this flow's `nonce` were
   * all verified. `null` when signed out or when the provider sends no ID token
   * (OAuth2-only providers such as GitHub). Never read identity from
   * `tokens().id_token` directly — that is the raw, unverified token.
   */
  claims: Signal<IdTokenClaims | null>
  /** When the access token expires (epoch ms), from `expires_in`; null if the provider did not say. */
  expiresAt: Signal<number | null>
  error: Signal<AuthError | null>
  signIn(): Promise<void>
  handleCallback(url: string): Promise<void>
  /**
   * Exchange the refresh token for fresh tokens. A new ID token must verify and
   * name the SAME `sub` — a refresh can never switch the signed-in user. Fails
   * (status `error`, session cleared) when there is no refresh token or the
   * provider refuses it; the user must sign in again.
   */
  refresh(): Promise<void>
  signOut(opts?: SignOutOptions): void
}

// Which issuer claimed which redirect URI, per flow store (the instances that share a store
// are the ones whose callbacks can be confused). Weak on the store; the inner map is bounded by
// the redirect URIs an app configures.
const redirectClaims = new WeakMap<FlowStore, Map<string, string>>()

/**
 * RFC 9700 §4.4: with no `iss` on the callback (GitHub, Facebook and many others send none), the
 * redirect URI is the only thing that says which provider a callback came from. Two providers on
 * one redirect URI over one flow store could have a malicious or compromised provider's flow
 * completed with the honest provider's code, so the configuration is refused up front.
 */
function claimRedirect(flows: FlowStore, redirectUri: string, issuer: string): void {
  const target = redirectTarget(redirectUri) ?? redirectUri
  let claims = redirectClaims.get(flows)
  if (claims === undefined) {
    claims = new Map()
    redirectClaims.set(flows, claims)
  }
  const prev = claims.get(target)
  if (prev !== undefined && prev !== issuer) {
    throw new Error(
      `[Pyreon] auth: ${issuer} and ${prev} share the redirect URI ${target}. Give each provider its own redirectUri ` +
        '(e.g. /auth/callback/github): a provider that sends no `iss` on the callback can otherwise be confused with another (OAuth mix-up, RFC 9700 §4.4).',
    )
  }
  claims.set(target, issuer)
}

/** Reactive auth state machine over the OIDC primitives. */
export function createAuth(opts: AuthOptions): Auth {
  const issuerName = (opts.issuer ?? opts.metadata?.issuer ?? '').replace(/\/$/, '')
  if (opts.binding === undefined && !opts.flows.tabScoped) {
    throw new Error(
      '[Pyreon] auth: createAuth needs `binding` to tie each sign-in to the browser that started it (login CSRF). ' +
        'On a server pass createFlowBinding(cookieHeader).value when signing in and readFlowBinding(cookieHeader) on the callback; ' +
        'in a browser use sessionStorageFlowStore() or useOidc.',
    )
  }
  claimRedirect(opts.flows, opts.client.redirectUri, issuerName)
  // A tab-scoped store binds flows to the browser by itself. `null` (no binding cookie on this
  // request) is a runtime condition, not a configuration error: the callback fails `unbound_flow`.
  const binding = opts.binding ?? (opts.flows.tabScoped ? 'tab' : '')
  const owner = (m: OidcMetadata) => ({ issuer: m.issuer, clientId: opts.client.clientId, redirectUri: opts.client.redirectUri, binding })
  const status = signal<AuthStatus>('signedOut')
  const tokens = signal<TokenResponse | null>(null)
  const claims = signal<IdTokenClaims | null>(null)
  const expiresAt = signal<number | null>(null)
  const error = signal<AuthError | null>(null)
  // Bumped by signOut/new attempts so a late async result can never resurrect a session.
  let epoch = 0
  let metaPromise: Promise<OidcMetadata> | undefined
  let metaResolved: OidcMetadata | undefined
  let jwks: JwksCache | undefined
  const meta = () =>
    (metaPromise ??= (opts.metadata ? Promise.resolve(opts.metadata) : discover(opts.issuer ?? '', opts.fetch)).then(
      (m) => {
        metaResolved = m
        return m
      },
      (e) => {
        metaPromise = undefined
        throw e
      },
    ))

  /**
   * Verify an ID token against the provider's keys (cached; re-fetched once on an
   * unknown kid, so key rotation works). A provider that returns an ID token but
   * publishes no keys is refused rather than trusted.
   */
  const verify = async (m: OidcMetadata, idToken: string, nonce: string | undefined): Promise<IdTokenClaims> => {
    if (!m.jwks_uri) {
      throw new AuthError('no_jwks', 'provider returned an id_token but publishes no jwks_uri to verify it')
    }
    jwks ??= createJwksCache(m, opts.fetch, opts.jwks)
    return verifyIdToken(idToken, jwks, m, { clientId: opts.client.clientId, ...(nonce === undefined ? {} : { nonce }) })
  }

  const commit = (t: TokenResponse, verified: IdTokenClaims | null) => {
    batch(() => {
      tokens.set(t)
      claims.set(verified)
      expiresAt.set(typeof t.expires_in === 'number' ? Date.now() + t.expires_in * 1000 : null)
      error.set(null)
      status.set('signedIn')
    })
  }

  const clear = () => {
    batch(() => {
      tokens.set(null)
      claims.set(null)
      expiresAt.set(null)
    })
  }

  const fail = (e: unknown) => {
    batch(() => {
      error.set(e instanceof AuthError ? e : new AuthError('unknown', String(e)))
      clear()
      status.set('error')
    })
  }

  let refreshing: Promise<void> | undefined
  const doRefresh = async (): Promise<void> => {
    const my = ++epoch
    try {
      const current = tokens.peek()
      if (!current?.refresh_token) throw new AuthError('no_refresh_token', 'no refresh token — sign in again')
      const m = await meta()
      const t = await refreshTokens(m, opts.client, current.refresh_token, opts.fetch)
      // Providers may rotate the refresh token; keep the old one when they don't.
      const next: TokenResponse = { ...t, refresh_token: t.refresh_token ?? current.refresh_token }
      let verified = claims.peek()
      if (t.id_token) {
        // A refreshed ID token carries no new nonce (OIDC Core §12.2) but must be
        // for the same user: a different `sub` means the session changed hands.
        const c = await verify(m, t.id_token, undefined)
        if (verified !== null && c.sub !== verified.sub) {
          throw new AuthError('subject_changed', 'refreshed id_token is for a different user')
        }
        verified = c
      }
      if (my !== epoch) return
      commit(next, verified)
    } catch (e) {
      if (my === epoch) fail(e)
    }
  }

  return {
    status,
    tokens,
    claims,
    expiresAt,
    error,
    async signIn() {
      const my = ++epoch
      status.set('signingIn')
      error.set(null)
      try {
        const m = await meta()
        const { url, flow } = await beginAuthorization(m, opts.client, binding)
        await opts.flows.save(await flowKey(flow.state, owner(m)), flow)
        if (my === epoch) opts.redirect(url)
      } catch (e) {
        if (my === epoch) fail(e)
      }
    },
    async handleCallback(url) {
      const my = ++epoch
      status.set('signingIn')
      try {
        const m = await meta()
        const params = new URL(url).searchParams
        if (!binding) throw new AuthError('unbound_flow', 'no flow binding on this request — the sign-in was started in another browser, or its cookie expired')
        // The key includes this instance's issuer, client, redirect URI and browser binding, so
        // only the flow THIS client started in THIS browser can come back; another instance's
        // flow is never read, let alone consumed.
        const flow = await opts.flows.take(await flowKey(params.get('state') ?? '', owner(m)))
        if (!flow) {
          // A provider error (e.g. the user cancelled) may come back without the
          // state; say what the provider said instead of "unknown flow".
          const providerError = params.get('error')
          if (providerError) throw new AuthError('provider_error', `provider returned "${providerError}"`)
          throw new AuthError('unknown_flow', 'no pending authorization for this state in this browser')
        }
        const { code } = parseCallback(url, flow, m, binding)
        const t = await exchangeCode(m, opts.client, flow, code, opts.fetch)
        // An ID token is identity, so it must verify before the session counts:
        // signature, iss / aud / expiry, and THIS flow's nonce (which binds the
        // token to the browser that started it).
        const verified = t.id_token ? await verify(m, t.id_token, flow.nonce) : null
        if (my !== epoch) return
        commit(t, verified)
      } catch (e) {
        if (my === epoch) fail(e)
      }
    },
    refresh() {
      // One refresh in flight per instance: with rotating refresh tokens and reuse detection, a
      // second concurrent call would present the already-rotated token and the provider would
      // revoke the whole token family.
      return (refreshing ??= doRefresh().finally(() => {
        refreshing = undefined
      }))
    },
    signOut(o) {
      epoch++
      const idToken = tokens.peek()?.id_token
      batch(() => {
        clear()
        error.set(null)
        status.set('signedOut')
      })
      if (o?.endProviderSession && metaResolved) {
        const url = endSessionUrl(metaResolved, {
          ...(idToken ? { idTokenHint: idToken } : {}),
          clientId: opts.client.clientId,
          ...(o.postLogoutRedirectUri ? { postLogoutRedirectUri: o.postLogoutRedirectUri } : {}),
        })
        if (url) opts.redirect(url)
      }
    },
  }
}

/** Upper bound on pending flows a `memoryFlowStore` holds at once. */
const MAX_PENDING_FLOWS = 1000

/**
 * In-memory flow store (tests, single-process servers). Entries are deleted on read.
 *
 * Bounded: a sign-in the user abandons at the provider is never `take`n, so each
 * `save` first drops flows older than the flow lifetime, and the store never holds
 * more than `MAX_PENDING_FLOWS` — the oldest is evicted first (Map order is
 * insertion order). An evicted flow simply fails its callback as `unknown_flow`.
 */
export function memoryFlowStore(): FlowStore {
  const m = new Map<string, PendingFlow>()
  return {
    save: (key, f) => {
      const cutoff = Date.now() - FLOW_TTL_MS
      for (const [k, v] of m) {
        if (v.createdAt >= cutoff) break // insertion order ≈ creation order
        m.delete(k)
      }
      while (m.size >= MAX_PENDING_FLOWS) m.delete(m.keys().next().value as string)
      m.set(key, f)
    },
    take: (key) => {
      const f = m.get(key) ?? null
      m.delete(key)
      return f
    },
  }
}
