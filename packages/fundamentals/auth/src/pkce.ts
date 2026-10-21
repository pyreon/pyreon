/** RFC 7636 PKCE + CSRF-state primitives on Web Crypto (browser, Node, Bun, workerd). */

const B64URL = /[+/=]/g

/** base64url without padding (RFC 4648 §5). */
export function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(B64URL, (c) => (c === '+' ? '-' : c === '/' ? '_' : ''))
}

/** `n` cryptographically random bytes, base64url-encoded. */
export function randomToken(n = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(n)))
}

/** 43-char verifier (32 random bytes) — the RFC 7636 §4.1 minimum length. */
export function generateCodeVerifier(): string {
  return randomToken(32)
}

/** `S256` challenge. `plain` is deliberately not offered (RFC 9700 §2.1.1). */
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}
