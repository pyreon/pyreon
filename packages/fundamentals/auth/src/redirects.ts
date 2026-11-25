import { redirectTarget } from './oidc'

/**
 * Which providers (issuers) have a live instance on which redirect target — process-wide.
 *
 * RFC 9700 §4.4 (OAuth mix-up): when the callback carries no `iss`, the redirect URI is the only
 * thing that says which provider answered. If two providers share one, a malicious or compromised
 * provider can bounce the user to an honest one with its own `state`, and the honest code plus the
 * PKCE verifier reach the attacker's token endpoint — whatever flow store either instance uses, so
 * the registry is keyed by the normalised redirect target, never by a store object.
 *
 * The rule, the same on web, iOS and Android:
 *  - a redirect target is SHARED while instances of two or more issuers are registered on it;
 *  - sharing is allowed only between providers that send RFC 9207 `iss`: a provider whose metadata
 *    does not advertise it is refused on a shared target (at construction when its metadata is
 *    explicit, at sign-in once discovery has said so), and every callback on a shared target must
 *    carry `iss` (`issuer_missing` otherwise);
 *  - an instance releases its claim when it is disposed (`useOidc` does this with its scope).
 *
 * Bounded by the redirect URIs an app configures (entries are dropped when their last instance is
 * released). It only sees providers constructed in this process: give every provider its own
 * redirect URI, which needs no registry at all.
 */
interface Claim {
  count: number
  /** Whether the provider advertises RFC 9207 `iss`; undefined until its metadata is known. */
  iss: boolean | undefined
}

const claims = new Map<string, Map<string, Claim>>()

const normIssuer = (issuer: string) => issuer.replace(/\/$/, '')

export interface RedirectClaim {
  /** The normalised redirect target. */
  readonly target: string
  /** True while another issuer also has a live instance on this target. */
  shared(): boolean
  /** Record whether this provider advertises `iss`. Returns false when that is not allowed (shared target, no `iss`). */
  advertise(iss: boolean): boolean
  /** Drop this instance's claim (idempotent). */
  release(): void
}

function sharingProblem(byIssuer: Map<string, Claim>): string | undefined {
  if (byIssuer.size < 2) return undefined
  const without = [...byIssuer].filter(([, c]) => c.iss === false).map(([i]) => i)

  return without.length > 0 ? without.join(', ') : undefined
}

export function claimRedirect(redirectUri: string, issuer: string, iss?: boolean): RedirectClaim {
  const target = redirectTarget(redirectUri) ?? redirectUri
  const name = normIssuer(issuer)
  let byIssuer = claims.get(target)
  if (byIssuer === undefined) {
    byIssuer = new Map()
    claims.set(target, byIssuer)
  }
  let claim = byIssuer.get(name)
  if (claim === undefined) {
    claim = { count: 0, iss }
    byIssuer.set(name, claim)
  }
  claim.count++
  if (iss !== undefined) claim.iss = iss
  let released = false
  const release = () => {
    if (released) return
    released = true
    claim.count--
    if (claim.count > 0) return
    byIssuer.delete(name)
    if (byIssuer.size === 0) claims.delete(target)
  }
  const problem = sharingProblem(byIssuer)
  if (problem !== undefined) {
    const others = [...byIssuer.keys()].filter((i) => i !== name)
    release()
    throw new Error(
      `[Pyreon] auth: ${name} and ${others.join(', ')} share the redirect URI ${redirectUri}, and a provider there does not send RFC 9207 \`iss\` on the callback (${problem}). ` +
        'Give each provider its own redirect URI (e.g. /auth/callback/github): otherwise a malicious or compromised provider can receive another provider\'s code and PKCE verifier (OAuth mix-up, RFC 9700 §4.4).',
    )
  }

  return {
    target,
    shared: () => (claims.get(target)?.size ?? 0) > 1,
    advertise(supported) {
      claim.iss = supported

      return supported || (claims.get(target)?.size ?? 0) < 2
    },
    release,
  }
}

/** Forget every claim — for tests and hot module replacement. Not exported from the package. */
export function _resetRedirectClaims(): void {
  claims.clear()
}
