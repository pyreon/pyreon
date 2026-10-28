import type { ClientConfig, OidcMetadata } from './oidc'

export interface Preset {
  /** Issuer for OIDC discovery. */
  issuer: string
  scope: string
}

/** OIDC-compliant providers: discovery works, nothing else to configure. */
export const google: Preset = { issuer: 'https://accounts.google.com', scope: 'openid profile email' }

/** Keycloak realm — `base` is the server origin (https), `realm` the realm name. */
export function keycloak(base: string, realm: string): Preset {
  return { issuer: `${base.replace(/\/$/, '')}/realms/${encodeURIComponent(realm)}`, scope: 'openid profile email' }
}

/** Merge a preset into a client config. */
export function withPreset(preset: Preset, client: Omit<ClientConfig, 'scope'> & { scope?: string }): ClientConfig {
  return { ...client, scope: client.scope ?? preset.scope }
}

/** Non-OIDC OAuth2 providers have no discovery document — pass endpoints explicitly (https, or loopback http for local development — enforced where each endpoint is used, by `beginAuthorization` and the token exchange / refresh, on every target). */
export function oauth2(issuer: string, authorization_endpoint: string, token_endpoint: string): OidcMetadata {
  return { issuer, authorization_endpoint, token_endpoint }
}

/** GitHub (OAuth2, not OIDC): identity comes from the user API, not an ID token. */
export const github: OidcMetadata = oauth2(
  'https://github.com',
  'https://github.com/login/oauth/authorize',
  'https://github.com/login/oauth/access_token',
)

/** Facebook Login (OAuth2). Versioned Graph endpoints — pin the version you have tested. */
export const facebook = (version = 'v21.0'): OidcMetadata =>
  oauth2(
    'https://www.facebook.com',
    `https://www.facebook.com/${version}/dialog/oauth`,
    `https://graph.facebook.com/${version}/oauth/access_token`,
  )
