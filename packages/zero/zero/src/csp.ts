/**
 * Content Security Policy middleware.
 *
 * Generates a CSP header from a typed configuration object.
 * Supports all CSP directives, nonces for inline scripts,
 * and report-only mode for testing.
 *
 * @example
 * ```ts
 * import { cspMiddleware } from "@pyreon/zero"
 *
 * const csp = cspMiddleware({
 *   directives: {
 *     defaultSrc: ["'self'"],
 *     scriptSrc: ["'self'", "'nonce'"],
 *     styleSrc: ["'self'", "'unsafe-inline'"],
 *     imgSrc: ["'self'", "data:", "https:"],
 *     connectSrc: ["'self'", "https://api.example.com"],
 *   },
 *   reportOnly: false,
 * })
 * ```
 */
import type { Middleware, MiddlewareContext } from '@pyreon/server'

/**
 * Module-level nonce for dev/SPA use. For production SSR with concurrent
 * requests, read `ctx.locals.cspNonce` in your server handler and pass
 * it to components via props or context.
 */
let _currentNonce = ''

/**
 * Read the current CSP nonce. Works for dev server and SPA.
 *
 * For production SSR with concurrent requests, use `ctx.locals.cspNonce`
 * from your middleware context instead — module-level state isn't
 * request-isolated.
 *
 * @example
 * ```tsx
 * import { useNonce } from "@pyreon/zero/csp"
 *
 * function InlineScript() {
 *   const nonce = useNonce()
 *   return <script nonce={nonce}>console.log("safe")</script>
 * }
 * ```
 */
export function useNonce(): string {
  return _currentNonce
}

export interface CspDirectives {
  defaultSrc?: string[]
  scriptSrc?: string[]
  styleSrc?: string[]
  imgSrc?: string[]
  fontSrc?: string[]
  connectSrc?: string[]
  mediaSrc?: string[]
  objectSrc?: string[]
  frameSrc?: string[]
  childSrc?: string[]
  workerSrc?: string[]
  frameAncestors?: string[]
  formAction?: string[]
  baseUri?: string[]
  manifestSrc?: string[]
  /** Reporting endpoint URL. */
  reportUri?: string
  /** Reporting endpoint name (CSP Level 3). */
  reportTo?: string
  /** Upgrade insecure requests. */
  upgradeInsecureRequests?: boolean
  /** Block all mixed content. */
  blockAllMixedContent?: boolean
}

export interface CspConfig {
  /** CSP directives. */
  directives: CspDirectives
  /**
   * Report-only mode — logs violations without blocking.
   * Uses Content-Security-Policy-Report-Only header instead.
   * Default: false
   */
  reportOnly?: boolean
}

const DIRECTIVE_MAP: Record<string, string> = {
  defaultSrc: 'default-src',
  scriptSrc: 'script-src',
  styleSrc: 'style-src',
  imgSrc: 'img-src',
  fontSrc: 'font-src',
  connectSrc: 'connect-src',
  mediaSrc: 'media-src',
  objectSrc: 'object-src',
  frameSrc: 'frame-src',
  childSrc: 'child-src',
  workerSrc: 'worker-src',
  frameAncestors: 'frame-ancestors',
  formAction: 'form-action',
  baseUri: 'base-uri',
  manifestSrc: 'manifest-src',
  reportUri: 'report-uri',
  reportTo: 'report-to',
}

/**
 * Build a CSP header string from directives.
 * Exported for testing.
 */
export function buildCspHeader(directives: CspDirectives, nonce?: string): string {
  const parts: string[] = []

  for (const [key, cssProp] of Object.entries(DIRECTIVE_MAP)) {
    const value = (directives as Record<string, unknown>)[key]
    if (!value) continue

    if (Array.isArray(value)) {
      // Replace "'nonce'" placeholder with actual nonce
      const resolved = nonce
        ? value.map((v: string) => (v === "'nonce'" ? `'nonce-${nonce}'` : v))
        : value.filter((v: string) => v !== "'nonce'")
      parts.push(`${cssProp} ${resolved.join(' ')}`)
    } else if (typeof value === 'string') {
      parts.push(`${cssProp} ${value}`)
    }
  }

  if (directives.upgradeInsecureRequests) {
    parts.push('upgrade-insecure-requests')
  }
  if (directives.blockAllMixedContent) {
    parts.push('block-all-mixed-content')
  }

  return parts.join('; ')
}

/**
 * Generate a random nonce string (base64, 16 bytes).
 */
function generateNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    // Convert to base64 using btoa
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64')
  }
  // Fallback for environments without crypto
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

/**
 * CSP middleware — sets Content-Security-Policy header.
 *
 * When directives contain `"'nonce'"`, a fresh nonce is generated per-request
 * and attached to `ctx.locals.cspNonce` for use in inline script tags.
 *
 * @example
 * ```ts
 * // Apply to all routes
 * export default defineConfig({
 *   middleware: [
 *     cspMiddleware({
 *       directives: {
 *         defaultSrc: ["'self'"],
 *         scriptSrc: ["'self'", "'nonce'"],
 *         styleSrc: ["'self'", "'unsafe-inline'"],
 *         imgSrc: ["'self'", "data:", "https:"],
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
export function cspMiddleware(config: CspConfig): Middleware {
  const headerName = config.reportOnly
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy'

  // Check if nonce is needed
  const needsNonce = Object.values(config.directives).some(
    (v) => Array.isArray(v) && v.includes("'nonce'"),
  )

  // Pre-build header for static case (no nonce)
  const staticHeader = needsNonce ? null : buildCspHeader(config.directives)

  return (ctx: MiddlewareContext) => {
    if (staticHeader) {
      _currentNonce = ''
      ctx.headers.set(headerName, staticHeader)
    } else {
      const nonce = generateNonce()
      _currentNonce = nonce
      ;(ctx.locals as Record<string, unknown>).cspNonce = nonce
      ctx.headers.set(headerName, buildCspHeader(config.directives, nonce))
    }
  }
}
