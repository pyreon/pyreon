/**
 * Framework dev warnings as verify findings.
 *
 * Shared by every plugin that mounts or hydrates a scenario, so a `[Pyreon] …`
 * warning is reported on the check that produced it rather than printed
 * mid-scan as untraceable noise while the scenario passes.
 */
import type { VerifyFinding } from '../core'
import { finding } from '../core'

/**
 * Collect the framework's own dev warnings for the duration of `run`.
 *
 * A mount that "succeeds" while Pyreon warns about it is not a clean mount:
 * the warnings are the framework naming a real defect (a boolean `tabIndex`, a
 * `<For>` without `by`, a reactive prop read at setup) that no exception will
 * ever surface. Before this they went to the terminal as untraceable noise
 * mid-scan and the scenario passed.
 *
 * Only messages starting `[Pyreon]` are taken — every framework warning uses
 * that prefix (it is lint-enforced), so a component's own `console.warn`
 * passes through untouched. Captured warnings are NOT re-printed: they are
 * reported on the scenario that produced them, which is the only place they
 * are actionable.
 */
export async function withFrameworkWarnings<T>(run: () => Promise<T>): Promise<{ result: T; warnings: string[] }> {
  const { restore, warnings } = interceptWarnings()
  try {
    return { result: await run(), warnings }
  } finally {
    restore()
  }
}

/** The synchronous twin, for the warm-up and re-probe mounts. */
export function syncFrameworkWarnings(run: () => void): string[] {
  const { restore, warnings } = interceptWarnings()
  try {
    run()
  } finally {
    restore()
  }
  return warnings
}

function interceptWarnings(): { warnings: string[]; restore: () => void } {
  const warnings: string[] = []
  const original = console.warn
  const capture = (...args: unknown[]): void => {
    const first = args[0]
    if (typeof first === 'string' && first.startsWith('[Pyreon]')) {
      const message = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')
      if (!warnings.includes(message)) warnings.push(message)
      return
    }
    original.apply(console, args as [])
  }
  console.warn = capture
  return {
    warnings,
    // Only undo OUR patch — a test spy installed after us must not be
    // clobbered by an out-of-order restore.
    restore: () => {
      if (console.warn === capture) console.warn = original
    },
  }
}

/**
 * The finding a captured framework warning becomes.
 *
 * `during` names where it fired (`mounted`, `hydrated`) so a warning that only
 * the SSR/hydrate path emits is not mistaken for one the plain mount does.
 */
export function frameworkWarningFinding(message: string, during = 'mounted'): VerifyFinding {
  return finding(
    'framework-warning',
    `Pyreon warned while this scenario ${during}: ${message.replace(/^\[Pyreon\]\s*/, '')}`,
    'The warning names the defect — fix the component (or the scenario args that trigger it) so it no longer fires.',
  )
}
