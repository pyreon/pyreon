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
  redirectUriProblem,
  refreshTokens,
  revokeToken,
} from './oidc'
import type { ClientConfig, FetchLike, OidcMetadata, PendingFlow, TokenResponse } from './oidc'
import { createJwksCache, verifyIdToken } from './jwt'
import { claimRedirect } from './redirects'
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
  /**
   * Revoke the session's refresh and access tokens at the provider (RFC 7009) when it advertises a
   * `revocation_endpoint`. Default true. Without it, a copied token stays usable until it expires
   * (a refresh token often for weeks). The local session is cleared at once either way; the
   * provider-logout redirect waits for the revocation (at most 5 s).
   */
  revokeTokens?: boolean
}

/** What `signOut()` did at the provider. The local session is always cleared. */
export interface SignOutResult {
  /**
   * True when every token the session held was revoked at the provider. False when nothing was
   * revoked: no session, `revokeTokens: false`, no advertised `revocation_endpoint`, or a failure
   * (`error`).
   */
  revoked: boolean
  /** Why a revocation failed (`network_error`, `provider_unavailable`, `revocation_failed`), or null. */
  error: AuthError | null
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
  /**
   * Complete a sign-in from the callback: an absolute URL, or the request's path and query
   * (`/auth/callback?code=…`), which is resolved against the configured redirect URI's origin.
   * Behind a TLS-terminating proxy pass the path, never the server's internal absolute URL.
   */
  handleCallback(url: string): Promise<void>
  /**
   * Exchange the refresh token for fresh tokens. A new ID token must verify and
   * name the SAME `sub` — a refresh can never switch the signed-in user. Fails
   * (status `error`, session cleared) when there is no refresh token or the
   * provider refuses it; the user must sign in again.
   */
  refresh(): Promise<void>
  /**
   * Clear the session (synchronously), revoke its tokens at the provider when it advertises a
   * `revocation_endpoint` (RFC 7009), and with `endProviderSession` end the provider session too.
   * Resolves when the provider work is done; local sign-out never fails.
   */
  signOut(opts?: SignOutOptions): Promise<SignOutResult>
  /**
   * Release this instance's claim on its redirect URI (see "one redirect URI per provider").
   * `useOidc` calls it when its scope is disposed; call it yourself for a `createAuth` you
   * create and throw away (a per-request server instance).
   */
  dispose(): void
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
  // Explicit metadata says up front whether the provider sends RFC 9207 `iss`; discovery says so at sign-in.
  if (redirectTarget(opts.client.redirectUri) === null) {
    throw new Error(`[Pyreon] auth: ${redirectUriProblem(opts.client.redirectUri)}.`)
  }
  const knownIss = opts.metadata ? opts.metadata.authorization_response_iss_parameter_supported === true : undefined
  let claim = claimRedirect(opts.client.redirectUri, issuerName, knownIss)
  let disposed = false
  // A disposed instance is not retired: a later sign-in or callback registers it again (and is
  // refused like a new instance would be if the URI is now shared with a provider without `iss`).
  const ensureClaim = () => {
    if (!disposed) return
    try {
      claim = claimRedirect(opts.client.redirectUri, issuerName, knownIss)
    } catch (e) {
      throw new AuthError('redirect_shared', e instanceof Error ? e.message.replace(/^\[Pyreon\] auth: /, '') : String(e))
    }
    disposed = false
  }
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

  // Bumped whenever the session itself changes (commit or clear). A refresh only applies its
  // result to the session it started from — see doRefresh.
  let sessionGen = 0
  const commit = (t: TokenResponse, verified: IdTokenClaims | null) => {
    sessionGen++
    batch(() => {
      tokens.set(t)
      claims.set(verified)
      expiresAt.set(typeof t.expires_in === 'number' ? Date.now() + t.expires_in * 1000 : null)
      error.set(null)
      status.set('signedIn')
    })
  }

  const clear = () => {
    sessionGen++
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

  // The refresh in flight, and the session generation it was started for.
  let refreshing: { gen: number; done: Promise<void> } | undefined
  const doRefresh = async (): Promise<void> => {
    // A refresh never bumps the epoch: starting one must not discard a sign-in or callback in
    // flight. It applies its result only while nothing else happened — no new attempt or sign-out
    // (the epoch) and no other commit (the session generation).
    const my = epoch
    const gen = sessionGen
    const current_ = () => my === epoch && gen === sessionGen
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
        let c: IdTokenClaims
        try {
          c = await verify(m, t.id_token, undefined)
        } catch (e) {
          // The token endpoint already ROTATED the refresh token: keep the new one even though the
          // new ID token cannot be checked right now (key set unreachable), or the retry would
          // present the spent token and a provider with reuse detection would revoke the family.
          if (e instanceof AuthError && TRANSIENT_REFRESH_ERRORS.has(e.code) && current_()) {
            batch(() => {
              // The new ID token is unverified: keep the previous one (the logout hint), or none.
              const { id_token: _unverified, ...rest } = next
              tokens.set(current.id_token === undefined ? rest : { ...rest, id_token: current.id_token })
              expiresAt.set(typeof next.expires_in === 'number' ? Date.now() + next.expires_in * 1000 : null)
              error.set(e)
              status.set('error')
            })

            return
          }
          throw e
        }
        if (verified !== null && c.sub !== verified.sub) {
          throw new AuthError('subject_changed', 'refreshed id_token is for a different user')
        }
        verified = c
      }
      if (!current_()) return
      commit(next, verified)
    } catch (e) {
      if (!current_()) return
      // A transient failure (offline, the provider down) keeps the session for a retry: status
      // `error` with the code, tokens and refresh token kept, so `refresh()` can try again.
      // Anything else (the refresh token refused or revoked, a bad ID token) ends the session.
      if (e instanceof AuthError && TRANSIENT_REFRESH_ERRORS.has(e.code)) {
        batch(() => {
          error.set(e)
          status.set('error')
        })
      } else {
        fail(e)
      }
    }
  }

  /**
   * Revoke a signed-out session's tokens (RFC 7009): the refresh token first — at most providers that
   * also ends the access tokens of its grant — then the access token. Bounded by a timeout, so a
   * provider that never answers cannot hold up the logout redirect. Resolves to the first failure.
   */
  const revokeHeld = async (m: OidcMetadata, held: TokenResponse): Promise<AuthError | null> => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), REVOKE_TIMEOUT_MS)
    try {
      const results = await Promise.allSettled([
        ...(held.refresh_token ? [revokeToken(m, opts.client, held.refresh_token, { tokenTypeHint: 'refresh_token', fetch: opts.fetch, signal: ctl.signal })] : []),
        revokeToken(m, opts.client, held.access_token, { tokenTypeHint: 'access_token', fetch: opts.fetch, signal: ctl.signal }),
      ])
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (!failed) return null

      return failed.reason instanceof AuthError ? failed.reason : new AuthError('unknown', String(failed.reason))
    } finally {
      clearTimeout(timer)
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
        ensureClaim()
        if (!claim.advertise(m.authorization_response_iss_parameter_supported === true)) {
          throw new AuthError(
            'redirect_shared',
            `another provider shares the redirect URI ${opts.client.redirectUri} and ${m.issuer} does not send RFC 9207 \`iss\` — give each provider its own redirect URI`,
          )
        }
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
        const href = callbackHref(url, opts.client.redirectUri)
        const params = new URL(href).searchParams
        ensureClaim()
        claim.advertise(m.authorization_response_iss_parameter_supported === true)
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
        // On a redirect URI another provider also uses, only `iss` says who answered: require it.
        const { code } = parseCallback(href, flow, claim.shared() ? { ...m, authorization_response_iss_parameter_supported: true } : m, binding)
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
      // Keyed by the session generation: after a sign-out and a new sign-in, a refresh still in
      // flight belongs to the old session and must not be handed to a caller of the new one.
      if (refreshing && refreshing.gen === sessionGen) return refreshing.done
      const entry = { gen: sessionGen, done: Promise.resolve() }
      entry.done = doRefresh().finally(() => {
        if (refreshing === entry) refreshing = undefined
      })
      refreshing = entry

      return entry.done
    },
    dispose() {
      claim.release()
      disposed = true
    },
    signOut(o) {
      const my = ++epoch
      const held = tokens.peek()
      const idToken = held?.id_token
      batch(() => {
        clear()
        error.set(null)
        status.set('signedOut')
      })
      const m = metaResolved
      const endSession = () => {
        // A sign-in started while the revocation ran owns the page now: do not navigate it away.
        if (!o?.endProviderSession || !m || my !== epoch) return
        const url = endSessionUrl(m, {
          ...(idToken ? { idTokenHint: idToken } : {}),
          clientId: opts.client.clientId,
          ...(o.postLogoutRedirectUri ? { postLogoutRedirectUri: o.postLogoutRedirectUri } : {}),
        })
        if (url) opts.redirect(url)
      }
      if (!held || o?.revokeTokens === false || !m?.revocation_endpoint) {
        endSession()

        return Promise.resolve({ revoked: false, error: null })
      }

      return revokeHeld(m, held).then((e) => {
        endSession()

        return { revoked: e === null, error: e }
      })
    },
  }
}

/**
 * The callback as an absolute URL. A path (`/auth/callback?code=…`, what Node's `req.url` holds)
 * is resolved against the configured redirect URI's origin: behind a TLS-terminating proxy the
 * server's own request URL says `http://127.0.0.1:3000/…`, which is not the public URL the
 * provider redirected to. Forwarded headers are never consulted.
 */
function callbackHref(url: string, redirectUri: string): string {
  if (url.startsWith('/') && !url.startsWith('//')) return new URL(url, redirectUri).href
  try {
    return new URL(url).href
  } catch {
    throw new AuthError('invalid_callback', 'the callback must be an absolute URL, or the path and query of the request (e.g. Node\'s req.url)')
  }
}

/** Refresh failures that keep the session for a retry: the provider could not be reached or was unavailable. */
const TRANSIENT_REFRESH_ERRORS = new Set(['network_error', 'provider_unavailable', 'discovery_failed', 'jwks_failed'])

/** How long `signOut()` waits for the provider to revoke the tokens before it moves on. */
const REVOKE_TIMEOUT_MS = 5000

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
