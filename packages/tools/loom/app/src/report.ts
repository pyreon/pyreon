/**
 * The scanned report, injected by `loom build` as a virtual module.
 *
 * ONE blob for the whole site rather than a per-route loader: every view
 * renders from the same scan, so five loaders would re-derive identical data
 * five times and, worse, could disagree if the workspace changed mid-build.
 */
import report from 'virtual:loom/report'
import type { LoomReport } from '../../src/core/types'

export const loomReport = report as LoomReport
