import { batch, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import {
  AuthError,
  FLOW_TTL_MS,
  beginAuthorization,
  discover,
  exchangeCode,
  parseCallback,
} from './oidc'
import type { ClientConfig, FetchLike, OidcMetadata, PendingFlow, TokenResponse } from './oidc'
import { fetchJwks, verifyIdToken } from './jwt'
import type { IdTokenClaims } from './jwt'

export type AuthStatus = 'signedOut' | 'signingIn' | 'signedIn' | 'error'

/** Where the PendingFlow lives across the redirect. Must NOT be localStorage. */
export interface FlowStore {
  save(flow: PendingFlow): void | Promise<void>
  /** Read-and-delete: a flow is single-use. */
  take(state: string): PendingFlow | null | Promise<PendingFlow | null>
}

export interface AuthOptions {
  /** OIDC issuer (discovery). Omit when passing `metadata`. */
  issuer?: string
  /** Explicit endpoints for non-OIDC OAuth2 providers (github, facebook). */
  metadata?: OidcMetadata
  client: ClientConfig
  flows: FlowStore
  /** Navigate the user agent to the provider. */
  redirect: (url: string) => void
  fetch?: FetchLike
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
  error: Signal<AuthError | null>
  signIn(): Promise<void>
  handleCallback(url: string): Promise<void>
  signOut(): void
}

/** Reactive auth state machine over the OIDC primitives. */
export function createAuth(opts: AuthOptions): Auth {
  const status = signal<AuthStatus>('signedOut')
  const tokens = signal<TokenResponse | null>(null)
  const claims = signal<IdTokenClaims | null>(null)
  const error = signal<AuthError | null>(null)
  // Bumped by signOut/new attempts so a late async result can never resurrect a session.
  let epoch = 0
  let metaPromise: Promise<OidcMetadata> | undefined
  const meta = () => (metaPromise ??= (opts.metadata ? Promise.resolve(opts.metadata) : discover(opts.issuer ?? '', opts.fetch)).catch((e) => {
    metaPromise = undefined
    throw e
  }))

  const fail = (e: unknown) => {
    batch(() => {
      error.set(e instanceof AuthError ? e : new AuthError('unknown', String(e)))
      tokens.set(null)
      claims.set(null)
      status.set('error')
    })
  }

  return {
    status,
    tokens,
    claims,
    error,
    async signIn() {
      const my = ++epoch
      status.set('signingIn')
      error.set(null)
      try {
        const m = await meta()
        const { url, flow } = await beginAuthorization(m, opts.client)
        await opts.flows.save(flow)
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
        const flow = await opts.flows.take(params.get('state') ?? '')
        if (!flow) {
          // A provider error (e.g. the user cancelled) may come back without the
          // state; say what the provider said instead of "unknown flow".
          const providerError = params.get('error')
          if (providerError) throw new AuthError('provider_error', `provider returned "${providerError}"`)
          throw new AuthError('unknown_flow', 'no pending authorization for this state')
        }
        const { code } = parseCallback(url, flow, m)
        const t = await exchangeCode(m, opts.client, flow, code, opts.fetch)
        // An ID token is identity, so it must verify before the session counts:
        // signature against the provider's published keys, iss / aud / expiry, and
        // THIS flow's nonce (which binds the token to the browser that started it).
        // A provider that returns an ID token it publishes no keys for is refused
        // rather than trusted. OAuth2-only providers send no ID token at all.
        let verified: IdTokenClaims | null = null
        if (t.id_token) {
          if (!m.jwks_uri) {
            throw new AuthError('no_jwks', 'provider returned an id_token but publishes no jwks_uri to verify it')
          }
          const keys = await fetchJwks(m, opts.fetch)
          verified = await verifyIdToken(t.id_token, keys, m, { clientId: opts.client.clientId, nonce: flow.nonce })
        }
        if (my !== epoch) return
        batch(() => {
          tokens.set(t)
          claims.set(verified)
          status.set('signedIn')
        })
      } catch (e) {
        if (my === epoch) fail(e)
      }
    },
    signOut() {
      epoch++
      batch(() => {
        tokens.set(null)
        claims.set(null)
        error.set(null)
        status.set('signedOut')
      })
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
    save: (f) => {
      const cutoff = Date.now() - FLOW_TTL_MS
      for (const [k, v] of m) {
        if (v.createdAt >= cutoff) break // insertion order ≈ creation order
        m.delete(k)
      }
      while (m.size >= MAX_PENDING_FLOWS) m.delete(m.keys().next().value as string)
      m.set(f.state, f)
    },
    take: (s) => {
      const f = m.get(s) ?? null
      m.delete(s)
      return f
    },
  }
}
