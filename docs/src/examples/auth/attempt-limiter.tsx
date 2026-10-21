import { createAttemptLimiter } from '@pyreon/auth'
import { signal } from '@pyreon/reactivity'

/**
 * Throttling a guessable check. A 6-digit code has a million values — with no limit an
 * attacker simply tries them. Wrap every code, passkey and password check in a limiter
 * keyed by account, and `reset` it on success.
 */
export default function AttemptLimiter() {
  const limiter = createAttemptLimiter({ max: 3, windowMs: 30_000 })
  const line = signal('3 attempts per 30 s for this account')

  const attempt = (correct: boolean) => {
    const gate = limiter.attempt('user-ada')
    if (!gate.allowed) {
      line.set(`blocked — try again in ${Math.ceil(gate.retryAfterMs / 1000)}s`)
      return
    }
    if (correct) {
      limiter.reset('user-ada')
      line.set('code correct — counter reset')
    } else {
      line.set(`wrong code — ${gate.remaining} attempt(s) left`)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '10px', padding: '18px', fontSize: '14px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => attempt(false)}>Submit a wrong code</button>
        <button onClick={() => attempt(true)}>Submit the right code</button>
      </div>
      <div data-testid="limiter-line">{() => line()}</div>
    </div>
  )
}
