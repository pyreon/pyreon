import { For, Show } from '@pyreon/core'
import { memoryFlowStore, useOidc } from '@pyreon/auth'
import { CLIENT_ID, createFakeProvider, ISSUER, REDIRECT_URI } from './fake-provider'
import type { ProviderMode } from './fake-provider'

const MODES: { mode: ProviderMode; label: string }[] = [
  { mode: 'honest', label: 'Honest provider' },
  { mode: 'wrong-nonce', label: 'Token from another sign-in' },
  { mode: 'forged-key', label: 'Forged signature' },
  { mode: 'mix-up', label: 'IdP mix-up' },
  { mode: 'deny', label: 'User clicks “Deny”' },
  { mode: 'swap-user', label: 'Refresh swaps the user' },
]

/**
 * The real `useOidc`, end to end, against a provider running in this page.
 *
 * Discovery, S256 PKCE, the code exchange and the ES256 ID-token check are the shipped
 * code paths. The only stand-ins are the network (`fetch`) and the browser trip to the
 * provider (`redirect`), which here calls the provider directly and feeds its redirect
 * back to `handleCallback` — exactly what the `/callback` page does for you on a real site.
 *
 * Pick a misbehaving provider and sign in again to see which check rejects it.
 */
export default function OidcSignIn() {
  const provider = createFakeProvider()

  const auth = useOidc({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    // Web-only options. A real app leaves all three out.
    fetch: provider.fetch,
    flows: memoryFlowStore(),
    redirect: (url) => {
      void provider.authorize(url).then((back) => {
        if (back) void auth.handleCallback(back)
      })
    },
  })

  const statusColor = () =>
    ({ signedIn: '#16a34a', signingIn: '#d97706', error: '#dc2626', signedOut: '#64748b' })[auth.status()]

  return (
    <div data-testid="oidc-demo" style={{ display: 'grid', gap: '14px', padding: '18px', fontSize: '14px' }}>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        Provider behaviour
        <select
          aria-label="provider behaviour"
          onChange={(e: Event) => provider.mode.set((e.target as HTMLSelectElement).value as ProviderMode)}
        >
          <For each={MODES} by={(m) => m.mode}>
            {(m) => <option value={m.mode}>{m.label}</option>}
          </For>
        </select>
      </label>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => void auth.signIn()}>Sign in</button>
        <button onClick={() => void auth.refresh()} disabled={() => !auth.isAuthenticated()}>
          Refresh tokens
        </button>
        <button onClick={() => auth.signOut()} disabled={() => !auth.isAuthenticated()}>
          Sign out (this app)
        </button>
        <button onClick={() => auth.signOut({ endProviderSession: true })} disabled={() => !auth.isAuthenticated()}>
          Sign out everywhere
        </button>
      </div>

      <div data-testid="auth-status">
        status: <strong style={() => ({ color: statusColor() })}>{() => auth.status()}</strong>
        <Show when={() => auth.error() !== null}>
          {' '}— error code <code>{() => auth.error()}</code>
        </Show>
      </div>

      <Show when={() => auth.isAuthenticated()}>
        <div style={{ display: 'grid', gap: '2px' }}>
          <div>
            name (verified claim): <strong>{() => auth.claim('name')}</strong>
          </div>
          <div>
            email: <code>{() => auth.claim('email')}</code> · sub: <code>{() => auth.subject()}</code>
          </div>
          <div>
            access token expires: <code>{() => new Date(auth.expiresAt() ?? 0).toLocaleTimeString()}</code>
          </div>
        </div>
      </Show>

      <Show when={() => provider.sessionEnded()}>
        <div>The provider's session was ended too — the next sign-in would prompt again.</div>
      </Show>

      <details>
        <summary>What went over the wire</summary>
        <ol style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
          <For each={() => provider.log().map((line, i) => ({ line, i }))} by={(e) => e.i}>
            {(e) => <li>{e.line}</li>}
          </For>
        </ol>
      </details>
    </div>
  )
}
