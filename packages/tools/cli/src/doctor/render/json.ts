/**
 * Machine-readable JSON renderer. The full `DoctorReport` is
 * structured for stable consumption — AI agents reading the output,
 * CI dashboards, third-party tools all see the same shape.
 *
 * Backward-compatibility note: the legacy `doctor.ts` pre-PR-2
 * emitted a different JSON shape (`{ passed, files, summary }`). The
 * legacy `--json` is preserved via the compat path in the CLI
 * orchestrator; this renderer is the new shape gated on `--format=json`
 * (or default JSON when the v2 flag set is in use).
 */

import type { DoctorReport } from '../types'

export const renderJson = (report: DoctorReport): string =>
  JSON.stringify(report, null, 2)
