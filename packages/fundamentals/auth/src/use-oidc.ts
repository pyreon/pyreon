import { computed } from '@pyreon/reactivity'
import { createAuth, memoryFlowStore } from './auth'
import type { AuthStatus, FlowStore, SignOutOptions } from './auth'
import { FLOW_TTL_MS } from './oidc'
import type { FetchLike, PendingFlow } from './oidc'

/**
 * Options for {@link useOidc}. Literal values in shared source also lower to the native
 * containers (`PyreonOidcAuth`); the web-only options are ignored there.
 */
export interface UseOidcOptions {
  /** The OIDC issuer (discovery). */
  issuer: string
  clientId: string
  /** Where the provider returns to on the web — a page of this app (https). */
  redirectUri: string
  /**
   * The redirect the native apps use — a custom scheme (`com.example.app:/oauth`) or a
   * claimed https link. Defaults to `redirectUri`. Not used on the web.
   */
  nativeRedirectUri?: string | undefined
  /** Default `openid profile email`. Add `offline_access` to receive a refresh token. */
  scope?: string | undefined
  /** Where the provider sends the user after `signOut({ endProviderSession: true })`. */
  postLogoutRedirectUri?: string | undefined
  /** Extra authorization parameters (`prompt`, `login_hint`, Google's `access_type`). */
  authorizationParams?: Record<string, string> | undefined
  /** Web only: where pending sign-ins live. Default `sessionStorageFlowStore()` in a browser. */
  flows?: FlowStore | undefined
  /** Web only: navigate to the provider. Default `location.assign`. */
  redirect?: ((url: string) => void) | undefined
  /** Web only: the fetch to use. */
  fetch?: FetchLike | undefined
}

/**
 * A reactive OIDC session with the SAME surface on web, iOS and Android: every member is
 * read as a call (`auth.status()`), and the strings it returns — status spellings and error
 * codes — are identical on all three targets.
 *
 * Persistence is NOT the same. Native keeps the session in the Keychain / Keystore, so a
 * relaunch is still signed in. The web holds tokens in memory only, so a reload starts at
 * `signedOut` — deliberately: tokens in `localStorage` / `sessionStorage` are readable by
 * any script on the page, which makes one XSS bug a stolen long-lived session. Call
 * `signIn()` again on load (silent while the provider session lasts), or keep the session
 * server-side behind an HttpOnly cookie (`signSession`).
 */
export interface UseOidcResult {
  /** `signedOut` | `signingIn` | `signedIn` | `error`. */
  status(): AuthStatus
  isAuthenticated(): boolean
  /** The verified `sub` claim, or null. */
  subject(): string | null
  /** A verified string claim (`email`, `name`, …) of the signed-in user, or null. */
  claim(name: string): string | null
  accessToken(): string | null
  /** When the access token expires (epoch milliseconds), or null. */
  expiresAt(): number | null
  /** The last failure's code (`bad_nonce`, `provider_error`, `cancelled`, …), or null. */
  error(): string | null
  /** Start sign-in: the web navigates to the provider; native opens the system browser. */
  signIn(): Promise<void>
  /** Exchange the refresh token for fresh tokens. */
  refresh(): Promise<void>
  signOut(opts?: SignOutOptions): void
  /** Complete a sign-in from a callback URL. `useOidc` already does this on the redirect page. */
  handleCallback(url: string): Promise<void>
}

const FLOW_PREFIX = 'pyreon.auth.flow.'
const MAX_SESSION_FLOWS = 16

/**
 * A flow store over `sessionStorage` — the default `useOidc` uses in a browser.
 *
 * The pending flow (state, nonce, PKCE verifier) must survive the provider round trip, and
 * in a browser that round trip is a full page load: an in-memory store is gone when the user
 * comes back, so every sign-in would fail with `unknown_flow`. `sessionStorage` is per tab
 * and cleared when the tab closes — the standard home for a browser client's pending
 * authorization. Entries are read-and-deleted, and expired or excess ones are swept on save.
 */
export function sessionStorageFlowStore(storage?: Storage): FlowStore {
  const s = storage ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : null)
  if (s === null) throw new Error('[Pyreon] auth: sessionStorageFlowStore needs a browser — pass a Storage, or use memoryFlowStore() on a server')
  return storageFlowStore(s)
}

function storageFlowStore(storage: Storage): FlowStore {
  const pending = (): { key: string; createdAt: number }[] => {
    const out: { key: string; createdAt: number }[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith(FLOW_PREFIX)) continue
      let createdAt = 0
      try {
        createdAt = Number((JSON.parse(storage.getItem(key) ?? 'null') as PendingFlow | null)?.createdAt) || 0
      } catch {
        // unreadable: oldest, swept first
      }
      out.push({ key, createdAt })
    }
    return out.sort((a, b) => a.createdAt - b.createdAt)
  }
  return {
    save(flow) {
      let entries = pending()
      for (const e of entries) if (flow.createdAt - e.createdAt > FLOW_TTL_MS) storage.removeItem(e.key)
      entries = pending()
      while (entries.length >= MAX_SESSION_FLOWS) storage.removeItem(entries.shift()!.key)
      storage.setItem(FLOW_PREFIX + flow.state, JSON.stringify(flow))
    },
    take(state) {
      const key = FLOW_PREFIX + state
      const raw = storage.getItem(key)
      storage.removeItem(key)
      if (raw === null) return null
      try {
        return JSON.parse(raw) as PendingFlow
      } catch {
        return null
      }
    },
  }
}

const isBrowser = () => typeof location !== 'undefined' && typeof history !== 'undefined'

/** True when `href` is a provider redirect to `redirectUri` (same origin + path, carrying state or an error). */
export function isRedirectFor(href: string, redirectUri: string): boolean {
  try {
    const here = new URL(href)
    const target = new URL(redirectUri, href)
    if (here.origin !== target.origin || here.pathname !== target.pathname) return false
    return here.searchParams.has('state') || here.searchParams.has('error')
  } catch {
    return false
  }
}

const CALLBACK_PARAMS = ['code', 'state', 'iss', 'error', 'error_description', 'error_uri', 'session_state']

/**
 * A reactive OIDC sign-in, shared across web, iOS and Android.
 *
 * On the web it is {@link createAuth} with browser defaults: pending flows in
 * `sessionStorage`, navigation by `location.assign`, and — when the current page IS the
 * redirect — the callback completed automatically, with the authorization code removed from
 * the address bar and history before anything awaits. In shared source the same call lowers
 * to the native `PyreonOidcAuth`, which runs the system browser and keeps the session in the
 * Keychain / Keystore.
 *
 * Call it ONCE, at the app root, and pass `auth` down: each call is its own session object.
 *
 * @example
 * const auth = useOidc({
 *   issuer: 'https://accounts.example.com',
 *   clientId: 'app',
 *   redirectUri: 'https://app.example.com/callback',
 *   nativeRedirectUri: 'com.example.app:/oauth',
 * })
 * // <Button onPress={() => auth.signIn()}>Sign in</Button>
 * // <Text>{auth.isAuthenticated() ? auth.claim('email') : auth.status()}</Text>
 */
export function useOidc(opts: UseOidcOptions): UseOidcResult {
  const auth = createAuth({
    issuer: opts.issuer,
    client: {
      clientId: opts.clientId,
      redirectUri: opts.redirectUri,
      ...(opts.scope === undefined ? {} : { scope: opts.scope }),
      ...(opts.authorizationParams === undefined ? {} : { authorizationParams: opts.authorizationParams }),
    },
    flows: opts.flows ?? (isBrowser() && typeof sessionStorage !== 'undefined' ? sessionStorageFlowStore() : memoryFlowStore()),
    redirect:
      opts.redirect ??
      ((url) => {
        if (isBrowser()) location.assign(url)
      }),
    ...(opts.fetch === undefined ? {} : { fetch: opts.fetch }),
  })
  const errorCode = computed(() => auth.error()?.code ?? null)

  if (isBrowser() && isRedirectFor(location.href, opts.redirectUri)) {
    const href = location.href
    // Scrub the code from the address bar and history FIRST: a code left in the URL leaks
    // through referrers and history, and a reload must not try to redeem it twice.
    const clean = new URL(href)
    for (const p of CALLBACK_PARAMS) clean.searchParams.delete(p)
    history.replaceState(history.state, '', clean.pathname + clean.search + clean.hash)
    void auth.handleCallback(href)
  }

  return {
    status: () => auth.status(),
    isAuthenticated: () => auth.status() === 'signedIn',
    subject: () => auth.claims()?.sub ?? null,
    claim: (name) => {
      const v = auth.claims()?.[name]
      return typeof v === 'string' ? v : null
    },
    accessToken: () => auth.tokens()?.access_token ?? null,
    expiresAt: () => auth.expiresAt(),
    error: () => errorCode(),
    signIn: () => auth.signIn(),
    refresh: () => auth.refresh(),
    signOut: (o) =>
      auth.signOut({
        ...o,
        ...(o?.postLogoutRedirectUri === undefined && opts.postLogoutRedirectUri !== undefined
          ? { postLogoutRedirectUri: opts.postLogoutRedirectUri }
          : {}),
      }),
    handleCallback: (url) => auth.handleCallback(url),
  }
}
