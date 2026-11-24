/**
 * The browser-verify bridge `atlas verify-browser` drives.
 *
 * The runner drives scenarios and reads reactive coverage THROUGH THE PAGE's
 * own module graph — the same instances the components run on. A dev server
 * is a dev tool; exposing its own instrumentation is the point, not a leak.
 *
 * ONLY the PURE half of the coverage kit crosses this import: the node array
 * it scores comes from the page's own `__PYREON_DEVTOOLS__.reactive` bridge
 * (installed by mount — the same reactivity instance the components run on).
 * Importing the STATEFUL half (start/take) here would read THIS import's
 * registry, which Vite's dep graph can resolve to a second instance that
 * never saw a single node.
 *
 * `runAxe` comes from the same relative path the shell imports the workbench
 * from, so the page holds ONE copy of the UI module.
 */
import { computeReactiveCoverage } from '@pyreon/reactivity/coverage'
import { runAxe } from '../../src/ui'

export function installVerifyBridge(): void {
  ;(globalThis as { __ATLAS_VERIFY__?: unknown }).__ATLAS_VERIFY__ = {
    computeReactiveCoverage,
    runAxe: (surface: Element, rules?: Record<string, { enabled: boolean }>) => runAxe(surface, undefined, rules),
  }
}
