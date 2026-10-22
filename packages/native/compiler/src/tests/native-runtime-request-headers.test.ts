// Runtime request header values — what lets a signed-in native app call its own API.
//
// Before this, a header VALUE had to be a string literal: `useFetch` warned and dropped anything else, and a
// `useQuery` `queryFn` fetch dropped it WITHOUT a word. So `Authorization: Bearer <token>` — the one header every
// authenticated app sends — could not cross at all, and the token from `useOidc` had nowhere to go.
//
// The value is now any expression typed `string`, evaluated when the request is BUILT. In `useQuery` that is inside
// the harness, once per run, so a key that carries the user re-fetches with the new token after sign-in. The token
// here is a prop and a signal — the capability does not depend on where the token comes from (`useOidc`'s
// `accessToken()`, a store, a prop).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const ME_SCREEN = `import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'

type Me = { name: string; email: string }

export function Profile(props: { userId: string; token: string }) {
  const me = useQuery<Me>(() => ({
    queryKey: ['me', props.userId],
    queryFn: () =>
      fetch('https://api.example.com/me', {
        headers: { accept: 'application/json', authorization: \`Bearer \${props.token}\` },
      }).then((r) => r.json()),
  }))
  return (
    <Stack>
      <Text>{me.data()?.name ?? ''}</Text>
    </Stack>
  )
}
`

const swift = () => transform(ME_SCREEN, { target: 'swift' })
const kotlin = () => transform(ME_SCREEN, { target: 'kotlin' })

describe('useQuery — a runtime Authorization header', () => {
  it('lowers with zero warnings on both targets', () => {
    expect(swift().warnings).toEqual([])
    expect(kotlin().warnings).toEqual([])
  })

  it('evaluates the token when the request is built, beside the literal header', () => {
    const s = swift().code
    expect(s).toContain('"accept": "application/json"')
    expect(s).toMatch(/"authorization": "Bearer \\\(token\)"/)
    // Inside the `.task` harness, not baked at declaration time.
    expect(s.indexOf('"authorization"')).toBeGreaterThan(s.indexOf('.task(id:'))
    const k = kotlin().code
    expect(k).toContain('"accept" to "application/json"')
    expect(k).toMatch(/"authorization" to "Bearer \$\{?token\}?"/)
    expect(k.indexOf('"authorization"')).toBeGreaterThan(k.indexOf('LaunchedEffect('))
  })

  it('keys the query on the user, so a new sign-in re-fetches with the new token', () => {
    expect(swift().code).toMatch(/\.task\(id: [^)]*userId/)
    expect(kotlin().code).toMatch(/LaunchedEffect\([^)]*userId/)
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

const fetchScreen = (header: string) => `import { useFetch } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Me = { name: string }
export function Profile() {
  const token = signal<string | null>(null)
  const me = useFetch<Me>('https://api.example.com/me', { headers: { authorization: ${header} } })
  return <Stack><Text>{me.data()?.name ?? ''}</Text></Stack>
}
`

describe('useFetch — a runtime header value', () => {
  const good = fetchScreen("'Bearer ' + (token() ?? '')")

  it('lowers with zero warnings and sends the header on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(good, { target })
      expect(r.warnings, target).toEqual([])
      expect(r.code, target).toMatch(/"authorization"(:| to) /)
      expect(r.code, target).toContain('token')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(good, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(good, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('a header value that cannot cross is named, not dropped', () => {
  const cases: [string, string, RegExp][] = [
    ['a value that may be null', 'token()', /may be null or undefined.*\?\? ''/],
    ['a number', '42 + 1', /must be a string.*got number/],
  ]
  for (const [what, header, msg] of cases) {
    it(`useFetch: ${what}`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(fetchScreen(header), { target })
        expect(r.warnings.join('\n'), target).toMatch(msg)
        expect(r.code, target).not.toMatch(/"authorization"/)
      }
    })
  }

  it('useQuery: a value that may be null — the case that used to vanish silently', () => {
    const src = ME_SCREEN.replace('Profile(props: { userId: string; token: string })', 'Profile(props: { userId: string; token: string | null })').replace('`Bearer ${props.token}`', 'props.token')
    expect(src).not.toBe(ME_SCREEN)
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n'), target).toMatch(/header "authorization" may be null or undefined/)
      expect(r.code, target).not.toMatch(/"authorization"/)
    }
  })
})

// The exact snippet `docs/src/content/docs/query.md` "Authenticated Requests" shows, wrapped in a component. The page
// claims it runs unchanged on iOS and Android, so that claim is checked here rather than asserted in prose.
describe('the documented authenticated-request pattern', () => {
  const DOCS = `import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'

type Me = { name: string; email: string }

export function Profile() {
  const session = signal<{ userId: string; token: string } | null>(null)
  const me = useQuery<Me>(() => ({
    queryKey: ['me', session()?.userId ?? 'anonymous'],
    queryFn: () =>
      fetch('https://api.example.com/me', {
        headers: { authorization: \`Bearer \${session()?.token ?? ''}\` },
      }).then((r) => r.json()),
    enabled: session() !== null,
  }))
  return <Stack><Text>{me.data()?.name ?? ''}</Text></Stack>
}
`
  it('lowers with zero warnings and sends the header on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(DOCS, { target })
      expect(r.warnings, target).toEqual([])
      expect(r.code, target).toMatch(/"authorization"(:| to) "Bearer /)
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(DOCS, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(DOCS, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

// The combination this capability exists for: a `useOidc` session (`@pyreon/auth`) calling the app's own API. The
// token is `string | null` (signed out has none), so the documented form gives it a fallback; the key carries the
// user, so signing in re-runs the query with the new token on device.
describe('useOidc → an authenticated useQuery', () => {
  const SIGNED_IN = `import { useOidc } from '@pyreon/auth'
import { useQuery } from '@pyreon/query'
import { Stack, Text, Button } from '@pyreon/primitives'

type Me = { name: string }

export function Account() {
  const auth = useOidc({ issuer: 'https://idp.example', clientId: 'app', redirectUri: 'com.example.app:/cb' })
  const me = useQuery<Me>(() => ({
    queryKey: ['me', auth.subject() ?? 'anonymous'],
    queryFn: () =>
      fetch('https://api.example.com/me', {
        headers: { authorization: \`Bearer \${auth.accessToken() ?? ''}\` },
      }).then((r) => r.json()),
    enabled: auth.isAuthenticated(),
  }))
  return (
    <Stack>
      <Text>{me.data()?.name ?? auth.status()}</Text>
      <Button onPress={() => auth.signIn()}>Sign in</Button>
    </Stack>
  )
}
`
  it('lowers with zero warnings, reading the session as native properties', () => {
    const s = transform(SIGNED_IN, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).toMatch(/"authorization": "Bearer \\\(\(?auth\.accessToken \?\? ""\)?\)"/)
    expect(s.code).toMatch(/\.task\(id: [^)]*auth\.subject/)
    const k = transform(SIGNED_IN, { target: 'kotlin' })
    expect(k.warnings).toEqual([])
    expect(k.code).toMatch(/"authorization" to "Bearer \$\{\(?auth\.accessToken\.value \?: ""\)?\}"/)
    expect(k.code).toMatch(/LaunchedEffect\([^)]*auth\.subject\.value/)
  })

  it('a raw `auth.accessToken()` header is refused with the fix — the token is null while signed out', () => {
    const raw = SIGNED_IN.replace("`Bearer ${auth.accessToken() ?? ''}`", 'auth.accessToken()')
    expect(raw).not.toBe(SIGNED_IN)
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(raw, { target }).warnings.join('\n'), target).toMatch(/header "authorization" may be null or undefined/)
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(SIGNED_IN, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(SIGNED_IN, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

// The auth guide's "Calling your API" example is labelled portable. Compile the block straight out of the page, so
// the label cannot drift away from what the compiler does (the first draft of that example did not lower).
describe('the auth guide example compiles to both targets', () => {
  const page = readFileSync(join(__dirname, '../../../../../docs/src/content/docs/auth.md'), 'utf8')
  const section = page.slice(page.indexOf('**Portable — web, iOS and Android.**'))
  const fence = section.slice(section.indexOf('```tsx'))
  const SNIPPET = fence.slice(fence.indexOf('\n') + 1, fence.indexOf('\n```'))

  it('the snippet was found', () => {
    expect(SNIPPET).toContain('useOidc(')
    expect(SNIPPET).toContain('useQuery<Me>')
  })

  it('lowers with zero warnings on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(SNIPPET, { target })
      expect(r.warnings, target).toEqual([])
      expect(r.code, target).toMatch(/"authorization"(:| to) "Bearer /)
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(SNIPPET, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(SNIPPET, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})
