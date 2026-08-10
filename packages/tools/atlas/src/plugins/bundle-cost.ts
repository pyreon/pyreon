/**
 * Per-component bundle cost — what importing THIS component costs a consumer.
 *
 * ── Why it is opt-in ──────────────────────────────────────────────────────
 *
 * Every measurement is a real bundler run. On a 108-component library that is
 * 108 builds, and the scan is otherwise ~2s — a metric that multiplies scan
 * time by an order of magnitude has to be asked for, not inflicted. It is also
 * the one item on the roadmap that reports a NUMBER rather than a bug: nothing
 * here can fail a scenario, so paying for it on every run buys nothing on the
 * runs where nobody reads it.
 *
 * ── What the number means, and what it does not ───────────────────────────
 *
 * Workspace packages and bare dependencies are EXTERNAL, exactly as the
 * repo-wide budget gate measures them. So this is "the bytes this component's
 * own source contributes", not "the bytes a page pays to show it" — a
 * component that renders through half of `@pyreon/elements` measures small,
 * because that cost belongs to elements and is counted there. Reporting the
 * transitive total instead would charge every component in a library for the
 * same shared runtime and make the numbers useless for comparing components,
 * which is the only thing they are good for.
 */
import { gzipSync } from 'node:zlib'
import type { AtlasPlugin } from './types'

/** What one component's own source costs, minified + gzipped. */
export interface BundleCost {
  /** minified bytes */
  raw: number
  /** minified + gzip(9) bytes — the number a consumer's transfer actually pays */
  gzip: number
}

export interface BundleCostOptions {
  /**
   * Told ONCE when no bundler is available, with the reason.
   *
   * Load-bearing rather than tidy. This plugin is opt-in, so someone who asks
   * for it and receives an empty field has to be told why — and the answer
   * ("you are on node; this needs Bun") is not guessable from an absent
   * field. A capability that silently does nothing is the same false-quiet as
   * a gate that scans zero files and reports a clean pass.
   */
  onUnavailable?: (reason: string) => void
  /**
   * Extra bare specifiers to treat as external.
   *
   * `@pyreon/*` and `node:*` are always external. A project importing a
   * third-party dependency needs it listed, or the bundler either inlines it
   * (charging this component for someone else's library) or fails to resolve
   * it and the measurement is skipped.
   */
  external?: readonly string[]
}

/**
 * Is a bundler available in this host?
 *
 * `Bun.build`, and only that today. `atlas scan` runs under whatever invoked
 * it: `bun atlas` has a bundler, `npx atlas` (node) does not, and neither does
 * vitest — which is why the measuring specs are describe-gated rather than
 * quietly passing on a stub.
 *
 * Deliberately NOT solved by adding esbuild as a dependency: that is real
 * install weight on every Atlas user for a metric most never read. Reusing the
 * project's own Vite (already an optional peer, already loaded by the module
 * loader) is the better door, and it is a separate change rather than
 * something to smuggle in here.
 */
export function canMeasureBundleCost(): boolean {
  return typeof (globalThis as { Bun?: { build?: unknown } }).Bun?.build === 'function'
}

export const NO_BUNDLER =
  'bundle cost needs a bundler — run `atlas scan` under Bun (`bun atlas scan`); ' +
  'node has none available, so no component was measured'

/**
 * Measure one file.
 *
 * Returns `undefined` rather than throwing or reporting zero: a component that
 * cannot be bundled is UNMEASURED, and a zero would read as "free", which is
 * the most misleading number available.
 */
export async function measureBundleCost(
  file: string,
  options: BundleCostOptions = {},
): Promise<BundleCost | undefined> {
  const Bun = (globalThis as { Bun?: { build?: (o: unknown) => Promise<unknown> } }).Bun
  if (typeof Bun?.build !== 'function') return undefined

  try {
    const result = (await Bun.build({
      entrypoints: [file],
      minify: true,
      // `bun`, not `browser`: it auto-externalizes Node builtins, and for a
      // pure-browser file the byte output is identical. The repo's budget gate
      // learned this the hard way — `browser` silently failed on every
      // server-touching package.
      target: 'bun',
      // Dynamic imports stay separate chunks, so a component that lazy-loads a
      // heavy dependency is not charged for bytes the consumer only pays on
      // demand. Same reasoning as the repo-wide gate.
      splitting: true,
      outdir: `/tmp/atlas-bundle-cost/${file.replace(/[^a-z0-9]+/gi, '-')}`,
      external: ['@pyreon/*', 'node:*', ...(options.external ?? [])],
      // The PRODUCTION size. Without this the measurement includes every
      // dev-only warning string, overstating what consumers ship by 5-20% and
      // making dev-diagnostic growth look like real weight.
      define: { 'process.env.NODE_ENV': '"production"' },
    })) as { success: boolean; outputs: { kind: string; text(): Promise<string> }[] }

    if (!result.success) return undefined
    const entry = result.outputs.find((o) => o.kind === 'entry-point')
    if (!entry) return undefined
    const code = await entry.text()
    return {
      raw: Buffer.byteLength(code, 'utf-8'),
      gzip: gzipSync(code, { level: 9 }).byteLength,
    }
  } catch {
    return undefined
  }
}

/** `1.2 KB`, or `840 B` — the panel and the guide read the same string. */
export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

/**
 * Decorate each component with its own bundle cost.
 *
 * A `decorate` hook rather than a `verify` check, deliberately: this reports a
 * number, and there is no threshold at which a component is WRONG. Making it a
 * check would force a pass/fail on a measurement, and the only honest verdict
 * would be a permanent `pass` — the false-green shape the verdict model was
 * fixed to avoid.
 */
export function bundleCostPlugin(options: BundleCostOptions = {}): AtlasPlugin {
  let warned = false
  return {
    name: 'atlas:bundle-cost',
    async decorate(ci) {
      if (!canMeasureBundleCost()) {
        // Once per run, not once per component: a hundred identical lines say
        // nothing the first does.
        if (!warned) {
          warned = true
          options.onUnavailable?.(NO_BUNDLER)
        }
        return ci
      }
      const file = ci.source
      // Unmeasurable is not zero. A component with no source on record, or a
      // host with no bundler, leaves the field ABSENT — a `0` would read as
      // "free", which is the most misleading number available.
      if (!file) return ci
      const cost = await measureBundleCost(file, options)
      return cost ? { ...ci, bundleCost: cost } : ci
    },
  }
}
