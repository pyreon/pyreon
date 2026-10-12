import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/auth',
  title: 'Authentication',
  tagline: 'OIDC/OAuth2 authorization-code + PKCE primitives and route guards — secure by default',
  description:
    'Authentication primitives for Pyreon. Phase 1a ships the framework-neutral core: S256-only PKCE, state + nonce, RFC 9207 `iss` mix-up protection, https-only OIDC discovery with issuer equality, a single-use short-lived pending flow, a public-client code exchange, and a route guard with an open-redirect-safe `returnTo`. Everything runs on Web Crypto + fetch, so it works in browsers, Node, Bun and workerd. Reactive state, session cookies, provider presets and the native runtime land in later phases.',
  category: 'universal',
  features: [
    'S256 PKCE only — `plain`, the implicit flow and the password grant are deliberately not offered',
    'state + nonce + RFC 9207 `iss` check on every callback; flows expire after 10 minutes',
    'Discovery refuses a non-https issuer, a non-https endpoint, or an issuer that does not equal the fetched URL',
    'Guard `returnTo` only round-trips same-origin relative paths',
  ],
  api: [
    {
      name: 'beginAuthorization',
      kind: 'function',
      signature:
        '(meta: OidcMetadata, client: ClientConfig, now?: number) => Promise<{ url: string; flow: PendingFlow }>',
      summary:
        'Builds the authorization redirect (code flow, S256 PKCE, state, nonce) and returns the `PendingFlow` that must survive the round trip. Persist the flow server-side or in a short-lived HttpOnly cookie — never in localStorage — and delete it after the callback whether or not it succeeded.',
      example: `const meta = await discover('https://accounts.example')
const { url, flow } = await beginAuthorization(meta, { clientId: 'app', redirectUri: 'https://app.example/cb' })
// store \`flow\`, then redirect the user to \`url\``,
      mistakes: [
        'Storing the PendingFlow in localStorage — it holds the PKCE verifier; keep it server-side or in an HttpOnly cookie',
        'Reusing a flow for a second callback — it is single-use; delete it after the first attempt',
      ],
      seeAlso: ['parseCallback', 'exchangeCode', 'discover'],
    },
    {
      name: 'parseCallback',
      kind: 'function',
      signature: '(callback: string | URL, flow: PendingFlow, meta: OidcMetadata, now?: number) => { code: string }',
      summary:
        'Validates the redirect back from the provider in a fixed order — expiry, provider error, state, `iss` (RFC 9207), then the code — and throws an `AuthError` with a stable `code` on any failure.',
      example: `const { code } = parseCallback(req.url, flow, meta)`,
      mistakes: ['Catching AuthError and continuing — every failure means the attempt is untrusted'],
      seeAlso: ['beginAuthorization', 'exchangeCode'],
    },
    {
      name: 'exchangeCode',
      kind: 'function',
      signature:
        '(meta: OidcMetadata, client: ClientConfig, flow: PendingFlow, code: string, fetchImpl?: FetchLike) => Promise<TokenResponse>',
      summary:
        'Exchanges the authorization code using the PKCE verifier (public client, no secret) and rejects anything that is not a bearer token response. Redirects from the token endpoint are refused.',
      example: `const tokens = await exchangeCode(meta, client, flow, code)`,
      mistakes: ['Sending a client secret from a browser or native app — public clients rely on PKCE'],
      seeAlso: ['parseCallback'],
    },
    {
      name: 'discover',
      kind: 'function',
      signature: '(issuer: string, fetchImpl?: FetchLike) => Promise<OidcMetadata>',
      summary:
        'Fetches OIDC discovery and validates it: https-only (loopback http allowed for dev), the document issuer must equal the issuer you asked for (OIDC Discovery §4.3), and the authorization and token endpoints must be https. Never pass a user-supplied issuer without an allowlist — discovery is an SSRF vector.',
      example: `const meta = await discover('https://accounts.example')`,
      mistakes: ['Passing a user-controlled issuer URL — allowlist issuers on the server'],
      seeAlso: ['beginAuthorization'],
    },
    {
      name: 'createAuth',
      kind: 'function',
      signature: '(opts: AuthOptions) => Auth',
      summary:
        'Reactive auth state machine over the OIDC primitives. Exposes `status` (signedOut | signingIn | signedIn | error), `tokens` and `error` as signals plus `signIn`, `handleCallback` and `signOut`. An epoch counter guarantees a late token exchange can never resurrect a session after `signOut()`; pending flows are read-and-deleted from the `FlowStore` so a callback URL cannot be replayed.',
      example: `const auth = createAuth({ issuer: google.issuer, client, flows, redirect: (u) => location.assign(u) })
await auth.signIn()
// on the callback route:
await auth.handleCallback(location.href)`,
      mistakes: [
        'Backing the FlowStore with localStorage — it holds the PKCE verifier; use a server store or an HttpOnly cookie',
        'Reading `auth.status` without calling it — it is a signal',
      ],
      seeAlso: ['beginAuthorization', 'google', 'keycloak'],
    },
    {
      name: 'signSession',
      kind: 'function',
      signature: '(payload: SessionPayload, opts: SessionOptions, now?: number) => Promise<string>',
      summary:
        'Signs a session into a cookie-safe `body.signature` string (HMAC-SHA256 over Web Crypto). Expiry lives inside the signed body, secrets must be at least 32 characters and rotate via a list (first signs, all verify), and values over 4096 bytes are refused. `verifySession` returns null — never throws — for tampered, expired or malformed input. Pair with `sessionCookie` for HttpOnly + Secure + SameSite=Lax + `__Host-` attributes.',
      example: `const cookie = sessionCookie('session', await signSession({ sub: user.id }, { secrets: [process.env.SESSION_SECRET!] }))
const session = await verifySession(value, { secrets: [process.env.SESSION_SECRET!] })`,
      mistakes: [
        'Putting the whole user profile in the cookie — it is capped at 4096 bytes; store a session id and look the rest up',
        'Replacing the secret instead of prepending it — existing sessions are invalidated; rotate by putting the new secret first',
      ],
      seeAlso: ['verifySession', 'sessionCookie'],
    },
    {
      name: 'github',
      kind: 'constant',
      signature: 'OidcMetadata',
      summary:
        'Endpoints for GitHub (OAuth2, not OIDC — there is no ID token; read identity from the user API with the access token). `facebook(version)` and `oauth2(issuer, authorize, token)` cover other plain OAuth2 providers. Pass as `createAuth({ metadata })` to skip discovery. Pin the Facebook Graph version you have tested.',
      example: `const auth = createAuth({ metadata: github, client, flows, redirect })`,
      mistakes: ['Expecting an `id_token` from a non-OIDC provider — fetch the profile with the access token instead'],
      seeAlso: ['createAuth', 'google', 'keycloak'],
    },
    {
      name: 'verifyIdToken',
      kind: 'function',
      signature: '(token: string, keys: readonly Jwk[], meta: OidcMetadata, opts: VerifyOptions) => Promise<IdTokenClaims>',
      summary:
        'Verifies an OIDC ID token on Web Crypto: algorithm allowlist (RS256 and ES256 only — `none` and every HS* alg are refused to rule out algorithm confusion), signature against the provider JWKS key chosen by `kid` and the header alg, then `iss`, `aud` (+ `azp` for multi-audience tokens), `exp` with 60 s skew, `sub` and the `nonce` you stored in the pending flow. Fetch keys with `fetchJwks(meta)` and cache them server-side; call this on the server, never trust an unverified `id_token`.',
      example: `const keys = await fetchJwks(meta)
const claims = await verifyIdToken(tokens.id_token!, keys, meta, { clientId: client.clientId, nonce: flow.nonce })`,
      mistakes: [
        'Decoding the id_token payload without verifying the signature — anyone can forge it',
        'Skipping the nonce — it binds the token to this login attempt and defeats replay',
        'Refetching the JWKS on every request — cache it and refresh only on an unknown `kid`',
      ],
      seeAlso: ['fetchJwks', 'exchangeCode'],
    },
    {
      name: 'runStrategy',
      kind: 'function',
      signature: "(strategy: PassportStrategyLike, input: PassportInput, options?: Record<string, unknown>) => Promise<PassportOutcome>",
      summary:
        "Passport bridge (`@pyreon/auth/passport`, server only). Runs any Passport strategy — passport-local, passport-oauth2, Keycloak, SAML — without Express or the `passport` package: the strategy is cloned, its `success/fail/redirect/pass/error` hooks are bound to a promise, and the result is a discriminated outcome. Strategies that keep OAuth state in `req.session` write it into the `session` object you pass, so back that with the pending-flow store. Rejects only when the strategy calls `error()` or throws.",
      example: `import { runStrategy } from '@pyreon/auth/passport'
const out = await runStrategy(new LocalStrategy(verify), { method: 'POST', url: '/login', body })
if (out.type === 'success') startSession(out.user)`,
      mistakes: [
        'Passing a shared `session` object across users — create one per attempt, it carries OAuth state/verifier',
        'Treating `fail` as an exception — it is a normal outcome (bad credentials); only `error` rejects',
      ],
      seeAlso: ['createAuth', 'signSession'],
    },
    {
      name: 'createGuard',
      kind: 'function',
      signature: '<S>(opts: GuardOptions<S>) => (path: string) => GuardResult',
      summary:
        'Framework-neutral route guard: returns `true` or `{ redirect }` to the login path carrying an open-redirect-safe `returnTo`. Adapt it to a router `beforeEnter`.',
      example: `const guard = createGuard({ session: () => user(), loginPath: '/login' })
guard('/account') // true | { redirect: '/login?returnTo=%2Faccount' }`,
      mistakes: ['Trusting a `returnTo` query param directly — run it through `safeReturnTo`'],
      seeAlso: ['safeReturnTo'],
    },
  ],
  multiplatform: {
    tier: 'web-only',
    rationale:
      'phase 1a is the TypeScript core only; the Swift/Kotlin runtime service containers (secure storage, system-browser round trip) land in phase 2 per the auth package plan',
  },
})
