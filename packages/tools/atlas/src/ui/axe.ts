/**
 * The axe-core half of the A11y panel.
 *
 * The four structural checks (`./a11y`) run continuously and cost nothing;
 * axe is the OPPOSITE trade — years of rule tuning, WCAG tags, contrast
 * mathematics, and an `incomplete` category that admits what needs a human —
 * at the price of a heavyweight run. So it is ON DEMAND (a button, not a
 * MutationObserver) and LAZILY imported (the workbench bundle does not carry
 * axe until the first run). Vendored, never reimplemented: rebuilding axe's
 * rule tuning is the canonical way to ship a worse axe.
 */

export interface AxeFinding {
  id: string
  impact: string
  help: string
  /** CSS selector of the first offending node — the highlight target. */
  target: string
  /** How many nodes this rule flagged. */
  nodes: number
}

export interface AxeReport {
  status: 'ready' | 'running' | 'done' | 'failed'
  violations: AxeFinding[]
  /** axe's "needs a human" category — reported, never silently dropped. */
  incomplete: number
  error?: string
}

export const AXE_IDLE: AxeReport = { status: 'ready', violations: [], incomplete: 0 }

interface RawAxeResult {
  violations: {
    id: string
    impact?: string
    help: string
    nodes: { target: unknown[] }[]
  }[]
  incomplete: { id: string }[]
}

type AxeRun = (context: Element, options: Record<string, unknown>) => Promise<RawAxeResult>

/**
 * Run axe against the preview surface.
 *
 * `resultTypes` trims the work to what the panel renders; the run is scoped to
 * the SURFACE so the workbench's own chrome cannot pollute the component's
 * verdict.
 */
export async function runAxe(
  surface: Element,
  importAxe: () => Promise<{ run: AxeRun }> = async () =>
    (await import('axe-core')).default as unknown as { run: AxeRun },
): Promise<AxeReport> {
  try {
    const axe = await importAxe()
    const result = await axe.run(surface, {
      resultTypes: ['violations', 'incomplete'],
      // The preview is a fragment, not a document — page-level rules
      // (landmarks, page title, html lang) would flag every component.
      rules: {
        region: { enabled: false },
        'page-has-heading-one': { enabled: false },
        'landmark-one-main': { enabled: false },
      },
    })
    return {
      status: 'done',
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact ?? 'unknown',
        help: v.help,
        target: String(v.nodes[0]?.target?.[0] ?? ''),
        nodes: v.nodes.length,
      })),
      incomplete: result.incomplete.length,
    }
  } catch (err) {
    // A failed run is a FAILED run — rendering it as "0 violations" would be
    // the fabricated-pass class.
    return {
      status: 'failed',
      violations: [],
      incomplete: 0,
      error: String((err as Error)?.message ?? err),
    }
  }
}
