import { codeChallengeS256, generateCodeVerifier } from '@pyreon/auth'
import { signal } from '@pyreon/reactivity'

/**
 * PKCE (RFC 7636) in one picture. The app keeps the verifier secret and sends only its
 * SHA-256 challenge to the provider; the code exchange later proves it holds the verifier.
 * An attacker who intercepts the authorization code cannot redeem it without the verifier.
 * `useOidc` does all of this for you — this demo only makes the two values visible.
 */
export default function PkceExplorer() {
  const verifier = signal('')
  const challenge = signal('')

  const roll = async () => {
    const v = generateCodeVerifier()
    verifier.set(v)
    challenge.set(await codeChallengeS256(v))
  }
  void roll()

  return (
    <div style={{ display: 'grid', gap: '10px', padding: '18px', fontSize: '14px', wordBreak: 'break-all' }}>
      <div>
        <span>code_verifier — stays in the app (pending flow):</span>
        <br />
        <code data-testid="pkce-verifier">{() => verifier()}</code>
      </div>
      <div>
        <span>code_challenge = BASE64URL(SHA-256(verifier)) — sent with code_challenge_method=S256:</span>
        <br />
        <code>{() => challenge()}</code>
      </div>
      <div>
        <button onClick={() => void roll()}>Generate another pair</button>
      </div>
    </div>
  )
}
