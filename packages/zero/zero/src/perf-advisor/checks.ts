/**
 * Build-time per-route performance advisor — the pure check core.
 *
 * Closes the "capability exists but is opt-in / knowledge-gated" DX gap:
 * Pyreon ships powerful perf levers (`collapse`, AVIF images, lean route
 * graphs) but a developer has to KNOW to turn them on / avoid the CLS
 * footgun. These checks let the build TELL them, per route, at the moment
 * they'd act on it.
 *
 * This module is intentionally PURE: every check is `(RouteAdvisorInput)
 * → AdvisorFinding | null` over already-gathered inputs. The Vite
 * `closeBundle` wiring that populates the input from the manifest + dist
 * (per-route chunk closure via `ssg-modulepreload`'s
 * `collectStaticChunkClosure`, collapsible-site counts via the compiler's
 * `scanCollapsibleSites`, emitted image formats via the image plugin) is
 * a separate layer — keeping the LOGIC pure makes it fixture-testable
 * without a real build, and lets both the build plugin AND a future
 * `pyreon doctor --perf` gate consume the same checks.
 *
 * Advisory only — these never fail a build. A gating layer can opt in to
 * fail on specific HIGH-confidence checks, but `hero-not-avif` (info) and
 * any future static-route heuristic must stay advisory (false-positive
 * prone).
 */

export type AdvisorSeverity = 'warn' | 'info'

export type AdvisorCheckId = 'collapse-off' | 'cls-footgun' | 'route-js-budget' | 'hero-not-avif'

export interface AdvisorFinding {
  /** Which check produced this finding. */
  check: AdvisorCheckId
  severity: AdvisorSeverity
  /** Human-readable description of the opportunity / footgun. */
  message: string
  /** Prescriptive, copy-pasteable fix. */
  fix: string
}

export interface RouteHeroImage {
  /** The preloaded/hero image source (heuristic: a `fetchpriority=high` preload). */
  src: string
  /** The emitted format set for this image, lowercased by the caller or here. */
  formats: readonly string[]
}

export interface RouteAdvisorInput {
  /** Route URL path, e.g. `/resume`. */
  path: string
  /** Whether `pyreon({ collapse })` is enabled for this build. */
  collapseEnabled: boolean
  /**
   * Count of literal-prop rocketstyle sites across this route's modules that
   * WOULD collapse (from the compiler's `scanCollapsibleSites`). 0 when the
   * route has none — or when collapse is already on (the caller may pass the
   * real count regardless; the check only fires when collapse is OFF).
   */
  collapsibleSiteCount: number
  /**
   * Resolved/emitted CSS text reachable from this route, for the CLS scan.
   * Omitted when the caller couldn't attribute CSS to the route (→ no CLS
   * finding for that route).
   */
  cssText?: string
  /** Total bytes of the route's STATIC JS chunk closure (raw or gzip — must match `jsBudget`'s unit). */
  jsBytes: number
  /** Byte budget; a `route-js-budget` finding fires when `jsBytes > jsBudget`. */
  jsBudget: number
  /** The route's preloaded/hero image, when one was detected. */
  heroImage?: RouteHeroImage
}

const CV_AUTO_RE = /content-visibility\s*:\s*auto\b/i
const INTRINSIC_SIZE_RE = /contain-intrinsic-(?:size|width|height|block-size|inline-size)\s*:/i

/** Format a byte count as a compact KB string for messages. */
export function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

/**
 * A — collapse is off but the route has literal-prop rocketstyle sites that
 * would collapse to static `cloneNode`s (no per-component reactive machinery
 * on hydrate). HIGH confidence: the count comes from the compiler's own
 * collapse scanner.
 */
export function checkCollapseOff(input: RouteAdvisorInput): AdvisorFinding | null {
  if (input.collapseEnabled) return null
  if (input.collapsibleSiteCount <= 0) return null
  const n = input.collapsibleSiteCount
  return {
    check: 'collapse-off',
    severity: 'warn',
    message: `collapse is OFF — ${n} literal-prop rocketstyle site${n === 1 ? '' : 's'} would collapse to a static cloneNode (skipping per-component reactive machinery on hydrate)`,
    fix: 'enable pyreon({ collapse: true })',
  }
}

/**
 * D — `content-visibility: auto` resolved without `contain-intrinsic-size`
 * (the bokisch.com/resume CLS bug). HIGH confidence. Same ReDoS-safe anchored
 * scan as the `pyreon/content-visibility-needs-intrinsic-size` lint rule + the
 * styler dev validator — this is the build-output layer of the same guard.
 */
export function checkClsFootgun(input: RouteAdvisorInput): AdvisorFinding | null {
  const css = input.cssText
  if (!css) return null
  if (!CV_AUTO_RE.test(css)) return null
  if (INTRINSIC_SIZE_RE.test(css)) return null
  return {
    check: 'cls-footgun',
    severity: 'warn',
    message:
      'content-visibility: auto resolved without contain-intrinsic-size — the browser estimates the off-screen box height then corrects it on render, shifting content below (CLS)',
    fix: 'add contain-intrinsic-size: auto <height> (camelCase containIntrinsicSize in style/theme objects)',
  }
}

/**
 * E — the route's static JS closure exceeds the budget. HIGH confidence
 * (measured from the manifest chunk graph). Caller picks the byte unit +
 * threshold; default budget is the caller's concern.
 */
export function checkJsBudget(input: RouteAdvisorInput): AdvisorFinding | null {
  if (input.jsBytes <= input.jsBudget) return null
  return {
    check: 'route-js-budget',
    severity: 'warn',
    message: `route ships ${formatKB(input.jsBytes)} of JS (budget ${formatKB(input.jsBudget)})`,
    fix: 'code-split with lazy(), or ship static sections as islands so their JS is deferred / dropped',
  }
}

/**
 * C — the preloaded/hero image has no AVIF variant. INFO (the LCP inference
 * from a `fetchpriority=high` preload is a heuristic, never gate on it).
 */
export function checkHeroNotAvif(input: RouteAdvisorInput): AdvisorFinding | null {
  const hero = input.heroImage
  if (!hero) return null
  const hasAvif = hero.formats.some((f) => f.toLowerCase() === 'avif')
  if (hasAvif) return null
  const fmts = hero.formats.length > 0 ? hero.formats.join(', ') : 'none'
  return {
    check: 'hero-not-avif',
    severity: 'info',
    message: `preloaded hero image ${hero.src} has no AVIF variant (formats: ${fmts}) — AVIF is ~20-30% smaller, cutting LCP bytes`,
    fix: "add 'avif' to the imagePlugin formats",
  }
}

const ALL_CHECKS = [checkCollapseOff, checkClsFootgun, checkJsBudget, checkHeroNotAvif] as const

/**
 * Run every check for one route, returning the findings (most-actionable
 * order: collapse, CLS, JS budget, AVIF). Pure — no I/O, no build coupling.
 */
export function runRouteAdvisor(input: RouteAdvisorInput): AdvisorFinding[] {
  const findings: AdvisorFinding[] = []
  for (const check of ALL_CHECKS) {
    const finding = check(input)
    if (finding) findings.push(finding)
  }
  return findings
}

export interface RouteAdvisorResult {
  path: string
  findings: AdvisorFinding[]
}

/** Run the advisor across many routes, dropping routes with no findings. */
export function runAdvisor(inputs: readonly RouteAdvisorInput[]): RouteAdvisorResult[] {
  const results: RouteAdvisorResult[] = []
  for (const input of inputs) {
    const findings = runRouteAdvisor(input)
    if (findings.length > 0) results.push({ path: input.path, findings })
  }
  return results
}
