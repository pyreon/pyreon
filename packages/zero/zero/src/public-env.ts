/**
 * Build-time loader for public (`ZERO_PUBLIC_*`) environment variables.
 *
 * Server-only (imports Vite's `loadEnv`). Kept in its own tiny module — NOT in
 * `vite-plugin.ts` — so it can be unit-tested without dragging the whole plugin
 * graph (router / sized-map / sub-plugins) into the test.
 */
import { loadEnv } from 'vite'
import { PUBLIC_ENV_PREFIX } from './env'

/**
 * Load `ZERO_PUBLIC_*` vars (from `.env*` files + shell env, via Vite's
 * `loadEnv`) and strip the prefix. This snapshot is inlined into BOTH the client
 * and SSR bundles as the `__ZERO_PUBLIC_ENV__` define, so `publicEnv()` reads it
 * isomorphically. ONLY prefixed vars are included — a secret (no prefix) can
 * never reach the client bundle.
 */
export function loadPublicEnvVars(mode: string, root: string): Record<string, string> {
  const raw = loadEnv(mode, root, PUBLIC_ENV_PREFIX)
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(PUBLIC_ENV_PREFIX)) out[key.slice(PUBLIC_ENV_PREFIX.length)] = value
  }
  return out
}
