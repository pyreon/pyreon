// `useOidc` (@pyreon/auth) → the native OIDC session container.
//
// One shared screen — sign in, show who, sign out at the provider — must lower with ZERO warnings on
// both targets and COMPILE (stub-typechecked here; the real-SDK lanes run the same probes). The
// shapes an author actually writes are covered on purpose: a status comparison (`=== 'signedIn'`)
// compiles only because native `status` is a String, and `signOut({ endProviderSession })` only
// because the receiver rewrites the object literal into a labelled argument.
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SCREEN = `import { useOidc } from '@pyreon/auth'
import { Stack, Text, Button, Show } from '@pyreon/primitives'

const ISSUER = 'https://accounts.example.com'

export function Account() {
  const auth = useOidc({
    issuer: ISSUER,
    clientId: 'app',
    redirectUri: 'https://app.example.com/callback',
    nativeRedirectUri: 'com.example.app:/oauth',
    scope: 'openid profile email offline_access',
    postLogoutRedirectUri: 'com.example.app:/bye',
    authorizationParams: { prompt: 'consent' },
  })
  return (
    <Stack>
      <Text>{auth.status()}</Text>
      <Show when={auth.isAuthenticated()}>
        <Text>{auth.claim('email') ?? auth.subject() ?? ''}</Text>
        <Button onPress={() => auth.refresh()}>Refresh</Button>
        <Button onPress={() => auth.signOut({ endProviderSession: true })}>Sign out everywhere</Button>
        <Button onPress={() => auth.signOut()}>Sign out</Button>
      </Show>
      <Show when={auth.status() !== 'signedIn'}>
        <Button onPress={() => auth.signIn()}>Sign in</Button>
      </Show>
      <Show when={auth.error() !== null}>
        <Text>{auth.error() ?? ''}</Text>
      </Show>
    </Stack>
  )
}
`

const swift = () => transform(SCREEN, { target: 'swift' })
const kotlin = () => transform(SCREEN, { target: 'kotlin' })

describe('useOidc → PyreonOidcAuth', () => {
  it('lowers with zero warnings on both targets', () => {
    expect(swift().warnings).toEqual([])
    expect(kotlin().warnings).toEqual([])
  })

  it('bakes the static config into the native initialiser, using the native redirect', () => {
    const s = swift().code
    expect(s).toContain(
      '@State private var auth = PyreonOidcAuth(issuer: "https://accounts.example.com", clientId: "app", redirectUri: "com.example.app:/oauth", scope: "openid profile email offline_access", postLogoutRedirectUri: "com.example.app:/bye", authorizationParams: ["prompt": "consent"])',
    )
    const k = kotlin().code
    expect(k).toContain(
      'val auth = rememberPyreonOidcAuth(issuer = "https://accounts.example.com", clientId = "app", redirectUri = "com.example.app:/oauth", scope = "openid profile email offline_access", postLogoutRedirectUri = "com.example.app:/bye", authorizationParams = mapOf("prompt" to "consent"))',
    )
    expect(s).not.toContain('https://app.example.com/callback')
  })

  it('reads accessors as properties (Kotlin: Compose state) and keeps the calls', () => {
    const s = swift().code
    expect(s).toContain('auth.status')
    expect(s).not.toContain('auth.status()')
    expect(s).toContain('auth.isAuthenticated')
    expect(s).toContain('auth.claim("email")')
    expect(s).toContain('auth.signOut(endProviderSession: true)')
    expect(s).toContain('auth.signIn()')
    const k = kotlin().code
    expect(k).toContain('auth.status.value')
    expect(k).not.toMatch(/auth\.isAuthenticated\.value/)
    expect(k).toContain('auth.signOut(endProviderSession = true)')
    expect(k).toContain('auth.error.value')
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(swift().code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(kotlin().code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('useOidc config the native initialiser cannot bake', () => {
  const screen = (opts: string) => `import { useOidc } from '@pyreon/auth'
import { Text } from '@pyreon/primitives'
export function A(props: { issuer: string }) {
  const auth = useOidc(${opts})
  return <Text>{auth.status()}</Text>
}
`
  const cases: [string, string, RegExp][] = [
    ['a runtime issuer', `{ issuer: props.issuer, clientId: 'a', redirectUri: 'x:/cb' }`, /`issuer` must be a string literal/],
    ['an insecure issuer', `{ issuer: 'http://idp.example', clientId: 'a', redirectUri: 'x:/cb' }`, /`issuer` must be https/],
    ['a missing clientId', `{ issuer: 'https://idp.example', redirectUri: 'x:/cb' }`, /`clientId` is required/],
    ['a reserved parameter', `{ issuer: 'https://idp.example', clientId: 'a', redirectUri: 'x:/cb', authorizationParams: { state: 'x' } }`, /cannot set "state"/],
    ['a non-literal options object', `makeOptions()`, /must be an object literal/],
    ['an unknown option', `{ issuer: 'https://idp.example', clientId: 'a', redirectUri: 'x:/cb', clientSecret: 's' }`, /`clientSecret` is not a useOidc option/],
  ]
  for (const [what, opts, msg] of cases) {
    it(`${what} is reported and nothing half-configured is emitted`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(screen(opts), { target })
        expect(r.warnings.join('\n'), target).toMatch(msg)
        expect(r.code, target).not.toMatch(/PyreonOidcAuth\(|rememberPyreonOidcAuth\(/)
      }
    })
  }

  it('loopback http is accepted (local development provider)', () => {
    const r = transform(screen(`{ issuer: 'http://localhost:8080/realms/dev', clientId: 'a', redirectUri: 'x:/cb' }`), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonOidcAuth(issuer: "http://localhost:8080/realms/dev"')
  })

  it('warns when the native apps would reuse a web https redirect', () => {
    const r = transform(screen(`{ issuer: 'https://idp.example', clientId: 'a', redirectUri: 'https://app.example/cb' }`), { target: 'kotlin' })
    expect(r.warnings.join('\n')).toMatch(/no `nativeRedirectUri`/)
    expect(r.code).toContain('redirectUri = "https://app.example/cb"')
  })

  it('web-only options are ignored natively, silently', () => {
    const r = transform(screen(`{ issuer: 'https://idp.example', clientId: 'a', redirectUri: 'x:/cb', flows: undefined, fetch: undefined }`), { target: 'swift' })
    expect(r.warnings).toEqual([])
  })

  it('a per-call postLogoutRedirectUri on signOut is reported, not dropped', () => {
    const src = `import { useOidc } from '@pyreon/auth'
import { Button } from '@pyreon/primitives'
export function A() {
  const auth = useOidc({ issuer: 'https://idp.example', clientId: 'a', redirectUri: 'x:/cb' })
  return <Button onPress={() => auth.signOut({ postLogoutRedirectUri: 'x:/bye' })}>out</Button>
}
`
    expect(transform(src, { target: 'swift' }).warnings.join('\n')).toMatch(/take `postLogoutRedirectUri` once, in the useOidc options/)
  })
})
