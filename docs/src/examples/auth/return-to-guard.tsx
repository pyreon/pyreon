import { For } from '@pyreon/core'
import { createGuard, safeReturnTo } from '@pyreon/auth'
import { signal } from '@pyreon/reactivity'

const ATTEMPTS = [
  '/billing/invoices?page=2',
  '//evil.example/steal',
  '/\t/evil.example',
  '/\\evil.example',
  'https://evil.example',
  'javascript:alert(1)',
]

/**
 * Where to send the user after sign-in is attacker-controlled input — a `returnTo` that
 * reaches another origin turns your login page into an open redirect. `safeReturnTo`
 * accepts only a path that stays on this origin under the URL parser browsers use, so the
 * check can never disagree with where the browser actually goes.
 */
export default function ReturnToGuard() {
  const signedIn = signal(false)
  const guard = createGuard({
    session: () => (signedIn() ? { sub: 'user-ada' } : null),
    loginPath: '/login',
  })
  const custom = signal('/settings')

  return (
    <div style={{ display: 'grid', gap: '12px', padding: '18px', fontSize: '14px' }}>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input type="checkbox" checked={() => signedIn()} onChange={() => signedIn.set(!signedIn.peek())} />
        signed in
      </label>
      <div>
        guard('/settings') →{' '}
        <code data-testid="guard-result">{() => JSON.stringify(guard('/settings'))}</code>
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', paddingRight: '16px' }}>returnTo</th>
            <th style={{ textAlign: 'left' }}>safeReturnTo(returnTo)</th>
          </tr>
        </thead>
        <tbody>
          <For each={ATTEMPTS} by={(a) => a}>
            {(a) => (
              <tr>
                <td style={{ paddingRight: '16px' }}>
                  <code>{JSON.stringify(a)}</code>
                </td>
                <td>
                  <code>{safeReturnTo(a)}</code>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        try one:
        <input
          aria-label="returnTo value"
          value={() => custom()}
          onInput={(e: Event) => custom.set((e.target as HTMLInputElement).value)}
        />
        → <code>{() => safeReturnTo(custom())}</code>
      </label>
    </div>
  )
}
