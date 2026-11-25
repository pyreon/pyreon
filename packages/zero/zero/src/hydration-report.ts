// ─── hydration-report.ts ───────────────────────────────────────────────────
//
// Internal: turns a hydration mismatch into the dev overlay's report. Split
// out of the public entry `dev-overlay.ts`, which imports from here, so these
// helpers are not public API; their unit tests reach them through
// `@pyreon/zero/internal`.

import type { HydrationMismatchContext } from '@pyreon/runtime-dom'
import { classifyStack, findFix, type OverlayReport } from './overlay/model'

/** The runtime's own console text for a mismatch (`hydration-debug.ts`), which the diagnose catalog matches. */
function mismatchMessage(ctx: HydrationMismatchContext): string {
  return `[Pyreon] Hydration mismatch (${ctx.type}): expected ${String(ctx.expected)}, got ${String(ctx.actual)} at ${ctx.path}`
}

/** @internal exported for tests */
export function buildHydrationReport(
  ctx: HydrationMismatchContext,
  stack: string | undefined,
  more: number,
): OverlayReport {
  const message = mismatchMessage(ctx)
  const route = typeof location !== 'undefined' ? location.pathname : '/'
  const quote = (v: unknown) => (ctx.type === 'text' && typeof v === 'string' ? JSON.stringify(v) : String(v))
  const report: OverlayReport = {
    kind: 'hydration',
    route,
    message,
    details: [
      { label: 'Server HTML', value: quote(ctx.actual) },
      { label: 'Client render', value: quote(ctx.expected) },
      { label: 'Where', value: ctx.path },
    ],
    stack: classifyStack(stack, { root: typeof location !== 'undefined' ? location.origin : '' }),
  }
  const fix = findFix(message)
  if (fix) report.fix = fix
  if (more > 0) report.note = `${more} more mismatch${more === 1 ? '' : 'es'} on this page; see the console.`

  return report
}
