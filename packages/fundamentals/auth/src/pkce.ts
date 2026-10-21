/** RFC 7636 PKCE + CSRF-state primitives on Web Crypto (browser, Node, Bun, workerd). */

const B64URL = /[+/=]/g

/** base64url without padding (RFC 4648 §5). */
export function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(B64URL, (c) => (c === '+' ? '-' : c === '/' ? '_' : ''))
}

const B64URL_ALPHABET = /^[A-Za-z0-9_-]*$/

/**
 * Strict base64url decode (RFC 4648 §5, no padding). Only the url-safe alphabet is
 * accepted, and the input must be the CANONICAL encoding of its bytes, so every
 * byte string has exactly one accepted spelling. `atob` alone is lenient — it skips
 * whitespace and takes `+`, `/` and `=` — which made a token's signature segment
 * re-encodable without invalidating it (a malleable token, and a disagreement with
 * the native verifiers, which are strict).
 */
export function decodeBase64url(s: string): Uint8Array<ArrayBuffer> {
  // The alphabet test is a cheap explicit first check; the canonical re-encode below already
  // rejects everything it does, which is what makes the rule exact.
  if (!B64URL_ALPHABET.test(s) || s.length % 4 === 1) throw new Error('[Pyreon] auth: invalid base64url')
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  if (base64url(out) !== s) throw new Error('[Pyreon] auth: invalid base64url')
  return out
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
