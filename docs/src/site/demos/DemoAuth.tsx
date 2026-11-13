import { For, onUnmount } from '@pyreon/core'
import { memoryFlowStore, useOidc } from '@pyreon/auth'
import { computed, signal, watch } from '@pyreon/reactivity'
import { CLIENT_ID, createFakeProvider, ISSUER, REDIRECT_URI, type ProviderMode } from '../../examples/auth/fake-provider'
import { font, paper, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { DemoSurface, GlowCard } from '../kit/cards'
import { DemoGrid, PaperButton } from '../kit/demo'
import { PaperActions, PaperSegmented, PaperTag, PaperText, SimulatedNote } from '../kit/demo-parts'
import { Eyebrow, StatusBadge } from '../kit/type'

/**
 * Auth demo (`auth.json` → demo). `@pyreon/auth` is on main and ships with
 * the next release, which the demo says on screen. It mounts the REAL
 * `useOidc` against the OpenID provider that lives in this page
 * (`docs/src/examples/auth/fake-provider.ts`: real discovery, S256 PKCE and
 * ES256-signed ID tokens; only the network and the login page are
 * simulated). The step list replays the flow; when the provider is switched
 * into a misbehaving mode, the step whose check fails turns red with the
 * code from `auth.error()`.
 */
const STEPS: readonly { title: string; text: string }[] = [
  { title: 'Discover the provider', text: 'https only; the issuer must match the URL it came from' },
  { title: 'Start the flow', text: 'S256 PKCE challenge, random state and nonce; expires in 10 minutes' },
  { title: 'Send the user to the provider', text: 'system browser on iOS and Android, a redirect on the web' },
  { title: 'Check the callback', text: 'state matches, iss matches (RFC 9207), flow used once' },
  { title: 'Exchange the code', text: 'with the PKCE verifier, over https' },
  { title: 'Verify the ID token', text: 'RS256 or ES256 against the provider keys; nonce matches' },
  { title: 'Signed in', text: 'claims verified; status() is signedIn' },
]

/** The step whose check produces each error code (0-based). */
const FAILS_AT: Record<string, number> = {
  provider_error: 2,
  issuer_mismatch: 3,
  bad_signature: 5,
  bad_nonce: 5,
}

const MODES: readonly ProviderMode[] = ['honest', 'wrong-nonce', 'forged-key', 'mix-up', 'deny']
const MODE_LABEL: Record<string, string> = {
  honest: 'honest',
  'wrong-nonce': 'replayed token',
  'forged-key': 'forged signature',
  'mix-up': 'issuer mix-up',
  deny: 'user denies',
}
const STEP_MS = 420

const Top = el
  .config({ name: 'AuthTop' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 10 })
  .theme(() => ({ flexWrap: 'wrap' }))

const Brand = txt.config({ name: 'AuthBrand' }).attrs({ tag: 'b' }).theme(() => ({ fontSize: 17, color: paper.text }))

const Body = el
  .config({ name: 'AuthBody' })
  .attrs({ block: true, contentAlignX: 'center', contentAlignY: 'center', gap: 6 })
  .theme(() => ({ minHeight: 150, textAlign: 'center', borderTop: `1px solid ${paper.line}`, borderBottom: `1px solid ${paper.line}`, paddingTop: 16, paddingBottom: 16 }))

const Welcome = txt.config({ name: 'AuthWelcome' }).attrs({ tag: 'p' }).theme(() => ({ margin: 0, fontSize: 20, fontWeight: 650, color: paper.text }))

const Mono = txt
  .config({ name: 'AuthMono' })
  .attrs({ tag: 'p' })
  .theme(() => ({ margin: 0, fontFamily: font.mono, fontSize: 12.5, color: paper.mist, overflowWrap: 'anywhere' }))

const StepList = el
  .config({ name: 'AuthSteps' })
  .attrs({ tag: 'ol', block: true, gap: 6 })
  .theme(() => ({ listStyle: 'none', margin: 0, marginTop: 10, padding: 0 }))

const Step = el
  .config({ name: 'AuthStep' })
  .attrs({ tag: 'li', block: true, gap: 2 })
  .theme((_t, m) => ({
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.note,
    color: tone(m, 'fog'),
    fontSize: text.ui.size,
  }))
  .states((_t, m) => ({
    idle: {},
    done: { color: tone(m, 'text'), borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill') },
    failed: { color: tone(m, 'err'), borderColor: tone(m, 'err') },
  }))

const StepNote = txt
  .config({ name: 'AuthStepNote' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size - 0.5, lineHeight: 1.45, color: tone(m, 'fog') }))

export default function DemoAuth() {
  const provider = createFakeProvider()
  const auth = useOidc({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    scope: 'openid profile email',
    // Web-only options for an in-page provider. A real app leaves all three out.
    fetch: provider.fetch,
    flows: memoryFlowStore(),
    redirect: (url) => {
      void provider.authorize(url).then((back) => {
        if (back) void auth.handleCallback(back)
      })
    },
  })

  // How far the step list has played, and where the real flow ended.
  const shown = signal(0)
  const target = signal<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = () => {
    const t = target.peek()
    if (t !== null && shown.peek() >= t) return
    // Keep pace with the real flow: never run past where it has got to.
    if (t === null && shown.peek() >= 2) {
      timer = setTimeout(tick, STEP_MS)
      return
    }
    shown.update((n) => n + 1)
    timer = setTimeout(tick, STEP_MS)
  }
  onUnmount(() => clearTimeout(timer))

  watch(
    () => [auth.status(), auth.error()] as const,
    ([status, error]) => {
      if (status === 'signedIn') target.set(STEPS.length)
      else if (status === 'error') target.set((FAILS_AT[error ?? ''] ?? 5) + 1)
    },
  )

  const failedAt = computed(() => {
    const e = auth.error()
    return auth.status() === 'error' && shown() >= (target() ?? Number.POSITIVE_INFINITY) ? (FAILS_AT[e ?? ''] ?? 5) : -1
  })

  const signIn = () => {
    clearTimeout(timer)
    shown.set(0)
    target.set(null)
    if (auth.isAuthenticated()) auth.signOut()
    tick()
    void auth.signIn()
  }
  const reset = () => {
    clearTimeout(timer)
    shown.set(0)
    target.set(null)
    auth.signOut()
  }

  const settled = () => target() !== null && shown() >= (target() ?? 0)
  const phase = () => (!settled() ? (shown() > 0 ? 'signingIn' : 'signedOut') : auth.status() === 'signedIn' ? 'signedIn' : 'error')

  return (
    <DemoGrid>
      <DemoSurface aria-label="Acme sign-in demo">
        <Top>
          <Brand>Acme</Brand>
          {() => {
            const p = phase()
            return (
              <PaperTag state={p === 'signedIn' ? 'ok' : p === 'error' ? 'err' : p === 'signingIn' ? 'warn' : 'idle'}>
                {p === 'signedIn' ? 'signed in' : p === 'error' ? `error · ${auth.error() ?? ''}` : p === 'signingIn' ? 'signing in' : 'signed out'}
              </PaperTag>
            )
          }}
        </Top>
        <Body aria-live="polite">
          {() => {
            const p = phase()
            if (p === 'signedIn')
              return (
                <>
                  <Welcome>{`Welcome back, ${String(auth.claim('name') ?? '')}`}</Welcome>
                  <Mono>{`claim('email') → ${String(auth.claim('email') ?? '')}`}</Mono>
                </>
              )
            if (p === 'error') return <PaperText>{`Sign-in stopped: auth.error() is '${auth.error() ?? ''}'.`}</PaperText>
            if (p === 'signingIn' && shown() >= 3)
              return (
                <>
                  <Mono>id.example.dev</Mono>
                  <PaperText>Continue as ada@example.dev?</PaperText>
                </>
              )
            return <PaperText>You are signed out.</PaperText>
          }}
        </Body>
        <PaperSegmented legend="Provider behaviour" options={MODES} value={() => provider.mode()} onChange={(m) => provider.mode.set(m)} format={(m) => MODE_LABEL[m] ?? m} />
        <PaperActions>
          <PaperButton type="button" variant="primary" onClick={signIn}>
            Sign in with the provider
          </PaperButton>
          <PaperButton type="button" onClick={reset}>
            Reset
          </PaperButton>
        </PaperActions>
      </DemoSurface>
      <GlowCard padding="compact">
        <Eyebrow>what the package does</Eyebrow>
        <StepList>
          <For each={STEPS.map((s, i) => ({ ...s, i }))} by={(s) => s.i}>
            {(s) => (
              <Step state={failedAt() === s.i ? 'failed' : shown() > s.i && failedAt() < 0 ? 'done' : shown() > s.i && s.i < failedAt() ? 'done' : 'idle'}>
                <span>{s.title}</span>
                <StepNote>{() => (failedAt() === s.i ? `stopped here: ${auth.error() ?? ''}` : s.text)}</StepNote>
              </Step>
            )}
          </For>
        </StepList>
        <div>
          <StatusBadge>next release</StatusBadge>
        </div>
        <SimulatedNote>@pyreon/auth is on main and ships with the next release. This runs it against an OpenID provider inside this page; only the network and the login page are simulated.</SimulatedNote>
      </GlowCard>
    </DemoGrid>
  )
}
