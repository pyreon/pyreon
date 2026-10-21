/**
 * @pyreon/auth — multiplatform authentication for Pyreon.
 *
 * Phase 1a: OIDC/OAuth2 authorization-code + PKCE primitives and route guards.
 * Secure by default: S256-only PKCE, state + nonce, RFC 9207 `iss` check,
 * https-only discovery with issuer-equality, single-use short-lived flows.
 */
import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export { base64url, codeChallengeS256, decodeBase64url, generateCodeVerifier, randomToken } from './pkce'
export {
  AuthError,
  beginAuthorization,
  discover,
  endSessionUrl,
  exchangeCode,
  parseCallback,
  refreshTokens,
  timingSafeEqual,
} from './oidc'
export type { ClientConfig, FetchLike, OidcMetadata, PendingFlow, TokenResponse } from './oidc'
export { createGuard, safeReturnTo } from './guard'
export type { GuardOptions, GuardResult } from './guard'
export { createAuth, memoryFlowStore } from './auth'
export type { Auth, AuthOptions, AuthStatus, FlowStore, SignOutOptions } from './auth'
export { isRedirectFor, sessionStorageFlowStore, useOidc } from './use-oidc'
export type { UseOidcOptions, UseOidcResult } from './use-oidc'
export { facebook, github, google, keycloak, oauth2, withPreset } from './presets'
export type { Preset } from './presets'
export { sessionCookie, signSession, verifySession } from './session'
export type { SessionOptions, SessionPayload } from './session'
export { createJwksCache, fetchJwks, tokenKid, verifyIdToken } from './jwt'
export type { IdTokenClaims, Jwk, JwksCache, JwksCacheOptions, VerifyOptions } from './jwt'
export { base32Decode, base32Encode, generateTotpSecret, totp, verifyTotp } from './totp'
export { createAttemptLimiter } from './ratelimit'
export type { AttemptLimiter, AttemptLimiterOptions, AttemptResult } from './ratelimit'
export { derToRaw, passkeyChallenge, verifyAssertion } from './passkey'
export type { AssertionExpectations, AssertionInput, AssertionResult } from './passkey'
export { verifyRegistration } from './passkey-register'
export type { RegistrationExpectations, RegistrationInput, RegistrationResult } from './passkey-register'
