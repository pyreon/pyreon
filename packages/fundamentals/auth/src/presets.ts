import type { ClientConfig } from './oidc'

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
