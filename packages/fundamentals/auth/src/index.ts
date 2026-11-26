/**
 * @pyreon/auth — multiplatform authentication for Pyreon.
 *
 * OIDC/OAuth2 authorization code + PKCE, sessions, TOTP, passkeys and route guards.
 * Secure by default: S256-only PKCE, state + nonce, flows bound to their client and browser,
 * the RFC 9207 `iss` check, https-only discovery with issuer equality, single-use short-lived flows.
 */
import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export { codeChallengeS256, generateCodeVerifier } from './pkce'
export { AuthError, beginAuthorization, discover, endSessionUrl, exchangeCode, parseCallback, refreshTokens, revokeToken } from './oidc'
export type { ClientConfig, FetchLike, OidcMetadata, PendingFlow, TokenResponse } from './oidc'
export { createFlowBinding, readFlowBinding } from './binding'
export type { FlowBindingOptions } from './binding'
export { createGuard, safeReturnTo } from './guard'
export type { GuardOptions, GuardResult } from './guard'
export { createAuth, memoryFlowStore } from './auth'
export type { Auth, AuthOptions, AuthStatus, FlowStore, SignOutOptions, SignOutResult } from './auth'
export { sessionStorageFlowStore, useOidc } from './use-oidc'
export type { UseOidcOptions, UseOidcResult } from './use-oidc'
export { facebook, github, google, keycloak, oauth2, withPreset } from './presets'
export type { Preset } from './presets'
export { sessionCookie, signSession, verifySession } from './session'
export type { SessionOptions, SessionPayload } from './session'
export { createJwksCache, verifyIdToken } from './jwt'
export type { IdTokenClaims, Jwk, JwksCache, JwksCacheOptions, VerifyOptions } from './jwt'
export { generateTotpSecret, totp, verifyTotp, verifyTotpWithMigration } from './totp'
export type { TotpOptions } from './totp'
export { createAttemptLimiter } from './ratelimit'
export type { AttemptLimiter, AttemptLimiterOptions, AttemptResult } from './ratelimit'
export { passkeyChallenge, verifyAssertion } from './passkey'
export type { AssertionExpectations, AssertionInput, AssertionResult } from './passkey'
export { verifyRegistration } from './passkey-register'
export type { RegistrationExpectations, RegistrationInput, RegistrationResult } from './passkey-register'
