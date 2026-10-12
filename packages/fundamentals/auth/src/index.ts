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

export { base64url, codeChallengeS256, generateCodeVerifier, randomToken } from './pkce'
export {
  AuthError,
  beginAuthorization,
  discover,
  exchangeCode,
  parseCallback,
  timingSafeEqual,
} from './oidc'
export type { ClientConfig, FetchLike, OidcMetadata, PendingFlow, TokenResponse } from './oidc'
export { createGuard, safeReturnTo } from './guard'
export type { GuardOptions, GuardResult } from './guard'
export { createAuth, memoryFlowStore } from './auth'
export type { Auth, AuthOptions, AuthStatus, FlowStore } from './auth'
export { google, keycloak, withPreset } from './presets'
export type { Preset } from './presets'
