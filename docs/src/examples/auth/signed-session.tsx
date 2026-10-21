import { Show } from '@pyreon/core'
import { sessionCookie, signSession, verifySession } from '@pyreon/auth'
import type { SessionPayload } from '@pyreon/auth'
import { signal } from '@pyreon/reactivity'

// Demo secrets only. In an app these come from the environment and are at least 32 chars.
const OLD_SECRET = 'docs-demo-secret-2025-rotate-me-please!!'
const NEW_SECRET = 'docs-demo-secret-2026-current-signing-key'

/**
 * A signed session cookie — HMAC-SHA-256 over the payload, verified in constant time, with
 * an expiry and a `jti` for revocation. Edit one character of the value and it no longer
 * verifies. Rotate the secret and cookies signed with the old one still verify as long as
 * the old secret stays in the list.
 */
export default function SignedSession() {
  const secrets = signal<string[]>([OLD_SECRET])
  const value = signal('')
  const verified = signal<SessionPayload | null | undefined>(undefined)
  const revoked = signal<Set<string>>(new Set())

  const opts = () => ({
    secrets: secrets.peek(),
    maxAge: 600,
    isRevoked: (jti: string) => revoked.peek().has(jti),
  })

  const sign = async () => {
    value.set(await signSession({ sub: 'user-ada', role: 'editor' }, opts()))
    verified.set(undefined)
  }
  const verify = async () => verified.set(await verifySession(value.peek(), opts()))
  void sign()

  return (
    <div style={{ display: 'grid', gap: '10px', padding: '18px', fontSize: '14px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => void sign()}>Sign a new session</button>
        <button onClick={() => void verify()}>Verify</button>
        <button
          onClick={() => {
            const v = value.peek()
            const i = v.length - 3
            value.set(v.slice(0, i) + (v[i] === 'A' ? 'B' : 'A') + v.slice(i + 1))
            verified.set(undefined)
          }}
        >
          Tamper one character
        </button>
        <button onClick={() => secrets.set([NEW_SECRET, OLD_SECRET])}>Rotate secret</button>
        <button
          onClick={() => {
            const jti = verified.peek()?.jti
            if (typeof jti === 'string') revoked.set(new Set([...revoked.peek(), jti]))
          }}
          disabled={() => !verified()}
        >
          Revoke this session
        </button>
      </div>
      <textarea
        aria-label="cookie value"
        rows={3}
        style={{ fontFamily: 'monospace', fontSize: '12px' }}
        value={() => value()}
        onInput={(e: Event) => {
          value.set((e.target as HTMLTextAreaElement).value)
          verified.set(undefined)
        }}
      />
      <div>
        signing with: <code>{() => (secrets()[0] === NEW_SECRET ? 'new secret (old one still verifies)' : 'original secret')}</code>
      </div>
      <Show when={() => verified() !== undefined}>
        <div data-testid="session-verdict">
          {() => {
            const v = verified()
            return v ? `valid — ${JSON.stringify({ sub: v.sub, role: v.role })}` : 'rejected (verifySession returned null)'
          }}
        </div>
      </Show>
      <div style={{ wordBreak: 'break-all' }}>
        Set-Cookie: <code>{() => sessionCookie('session', value().slice(0, 24) + '…', 600)}</code>
      </div>
    </div>
  )
}
