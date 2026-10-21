import { onMount, Show } from '@pyreon/core'
import { generateTotpSecret, totp, verifyTotp } from '@pyreon/auth'
import { signal } from '@pyreon/reactivity'

/**
 * Two-factor codes (RFC 6238), live. The left half is what an authenticator app shows for
 * this secret; the right half is the server's check. A code is accepted once: verifying
 * returns the time step it matched, and passing that back as `lastUsedStep` refuses a
 * replay of the same code.
 */
export default function TotpLive() {
  const secret = signal(generateTotpSecret())
  const code = signal('······')
  const secondsLeft = signal(30)
  const input = signal('')
  const lastUsedStep = signal<number | undefined>(undefined)
  const verdict = signal<string | null>(null)

  const tick = async () => {
    code.set(await totp(secret.peek()))
    secondsLeft.set(30 - (Math.floor(Date.now() / 1000) % 30))
  }

  onMount(() => {
    void tick()
    const id = setInterval(() => void tick(), 1000)
    return () => clearInterval(id)
  })

  const check = async () => {
    const r = await verifyTotp(secret.peek(), input.peek(), { lastUsedStep: lastUsedStep.peek() })
    if (r.ok) lastUsedStep.set(r.step)
    verdict.set(r.ok ? `accepted (time step ${r.step})` : 'rejected')
  }

  const otpauth = () =>
    `otpauth://totp/Pyreon%20Docs:ada@example.dev?secret=${secret()}&issuer=Pyreon%20Docs&digits=6&period=30`

  return (
    <div data-testid="totp-demo" style={{ display: 'grid', gap: '14px', padding: '18px', fontSize: '14px' }}>
      <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: '6px' }}>
          <span>Authenticator app</span>
          <strong data-testid="totp-code" style={{ fontSize: '28px', letterSpacing: '4px', fontFamily: 'monospace' }}>
            {() => code()}
          </strong>
          <span>{() => `refreshes in ${secondsLeft()}s`}</span>
        </div>
        <div style={{ display: 'grid', gap: '6px' }}>
          <span>Server check</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              aria-label="six-digit code"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={() => input()}
              onInput={(e: Event) => input.set((e.target as HTMLInputElement).value)}
            />
            <button onClick={() => void check()}>Verify</button>
            <button onClick={() => input.set(code.peek())}>Paste current</button>
          </div>
          <Show when={() => verdict() !== null}>
            <span data-testid="totp-verdict">{() => verdict()}</span>
          </Show>
        </div>
      </div>
      <div>
        secret (base32): <code>{() => secret()}</code>{' '}
        <button
          onClick={() => {
            secret.set(generateTotpSecret())
            lastUsedStep.set(undefined)
            verdict.set(null)
            void tick()
          }}
        >
          New secret
        </button>
      </div>
      <div style={{ wordBreak: 'break-all' }}>
        enrolment URI (render it as a QR code): <code>{() => otpauth()}</code>
      </div>
    </div>
  )
}
