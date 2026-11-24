import { FLOW_TTL_MS } from './oidc'
import { randomToken } from './pkce'
import { sessionCookie } from './session'

/**
 * Browser binding for server-side sign-ins (a backend-for-frontend).
 *
 * A pending flow is looked up by its `state`, which travels in the callback URL. Without a
 * binding, an attacker can start a sign-in on your server, finish it at the provider as
 * THEMSELVES, and send the resulting callback URL to a victim: the victim's browser completes it
 * and is signed in to the attacker's account (login CSRF; PKCE does not help, the verifier is on
 * your server). The binding is a random value in a `__Host-` cookie set when the sign-in starts;
 * the flow is stored under a key that includes it, so a callback from any other browser finds
 * nothing.
 */

const DEFAULT_NAME = 'pyreon-auth-binding'
const SHAPE = /^[A-Za-z0-9_-]{43}$/

export interface FlowBindingOptions {
  /** Cookie name, without the `__Host-` prefix. Default `pyreon-auth-binding`. */
  name?: string
}

function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) {
      const v = part.slice(eq + 1).trim()
      return SHAPE.test(v) ? v : null
    }
  }

  return null
}

/**
 * The binding to start a sign-in with, and the `Set-Cookie` header to send with the redirect to
 * the provider. Reuses the browser's existing binding when its request carries one, so two
 * sign-ins started in two tabs do not invalidate each other. The cookie lives for the flow
 * lifetime (10 minutes).
 */
export function createFlowBinding(
  cookieHeader?: string | null,
  opts: FlowBindingOptions = {},
): { value: string; setCookie: string } {
  const name = opts.name ?? DEFAULT_NAME
  const value = readCookie(cookieHeader, `__Host-${name}`) ?? randomToken(32)
  return { value, setCookie: sessionCookie(name, value, FLOW_TTL_MS / 1000) }
}

/**
 * The binding the callback request carries, or null when it has none (the sign-in was started
 * in another browser, or the cookie expired). Pass it to `createAuth({ binding })` /
 * `parseCallback`; a null binding fails the callback with `unbound_flow`.
 */
export function readFlowBinding(cookieHeader: string | null | undefined, opts: FlowBindingOptions = {}): string | null {
  return readCookie(cookieHeader, `__Host-${opts.name ?? DEFAULT_NAME}`)
}
