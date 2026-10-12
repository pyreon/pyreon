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
