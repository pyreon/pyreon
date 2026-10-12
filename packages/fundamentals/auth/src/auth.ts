import { signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import {
  AuthError,
  beginAuthorization,
  discover,
  exchangeCode,
  parseCallback,
} from './oidc'
import type { ClientConfig, FetchLike, OidcMetadata, PendingFlow, TokenResponse } from './oidc'

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
  error: Signal<AuthError | null>
  signIn(): Promise<void>
  handleCallback(url: string): Promise<void>
  signOut(): void
}

/** Reactive auth state machine over the OIDC primitives. */
export function createAuth(opts: AuthOptions): Auth {
  const status = signal<AuthStatus>('signedOut')
  const tokens = signal<TokenResponse | null>(null)
  const error = signal<AuthError | null>(null)
  // Bumped by signOut/new attempts so a late async result can never resurrect a session.
  let epoch = 0
  let metaPromise: Promise<OidcMetadata> | undefined
  const meta = () => (metaPromise ??= (opts.metadata ? Promise.resolve(opts.metadata) : discover(opts.issuer ?? '', opts.fetch)).catch((e) => {
    metaPromise = undefined
    throw e
  }))

  const fail = (e: unknown) => {
    error.set(e instanceof AuthError ? e : new AuthError('unknown', String(e)))
    tokens.set(null)
    status.set('error')
  }

  return {
    status,
    tokens,
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
        const state = new URL(url).searchParams.get('state') ?? ''
        const flow = await opts.flows.take(state)
        if (!flow) throw new AuthError('unknown_flow', 'no pending authorization for this state')
        const { code } = parseCallback(url, flow, m)
        const t = await exchangeCode(m, opts.client, flow, code, opts.fetch)
        if (my !== epoch) return
        tokens.set(t)
        status.set('signedIn')
      } catch (e) {
        if (my === epoch) fail(e)
      }
    },
    signOut() {
      epoch++
      tokens.set(null)
      error.set(null)
      status.set('signedOut')
    },
  }
}

/** In-memory flow store (tests, single-process servers). Entries are deleted on read. */
export function memoryFlowStore(): FlowStore {
  const m = new Map<string, PendingFlow>()
  return {
    save: (f) => void m.set(f.state, f),
    take: (s) => {
      const f = m.get(s) ?? null
      m.delete(s)
      return f
    },
  }
}
