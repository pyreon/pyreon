// The compile-gate stub text and the emitter sources of every first-party plugin, in one place, so the gates that
// audit stubs against the real runtimes (`stub-runtime-member-parity`, `emitted-runtime-types-exist`) keep covering a
// library after its lowering moves into its package. A library that moves registers here once; without it those gates
// would silently stop reading its stubs — the failure mode of a moved stub nobody re-pointed a check at.
import { join, resolve } from 'node:path'
import { KOTLIN_CHART_VIEW_STUBS, SWIFT_CHART_VIEW_STUBS } from '../../../../fundamentals/charts/src/native-plugin/stubs'
import { FLOW_KOTLIN_STUBS, FLOW_SWIFT_STUBS } from '../../../../fundamentals/flow/src/native-plugin/stubs'
import { I18N_KOTLIN_STUBS, I18N_SWIFT_STUBS } from '../../../../fundamentals/i18n/src/native-plugin/stubs'
import { MACHINE_KOTLIN_STUBS, MACHINE_SWIFT_STUBS } from '../../../../fundamentals/machine/src/native-plugin/stubs'
import {
  QUERY_KOTLIN_STUBS,
  QUERY_SWIFT_STUBS,
  STREAM_KOTLIN_STUBS,
  STREAM_SWIFT_STUBS,
} from '../../../../fundamentals/query/src/native-plugin/stubs'
import { TOAST_KOTLIN_STUBS, TOAST_SWIFT_STUBS } from '../../../../fundamentals/toast/src/native-plugin/stubs'
import { A11Y_KOTLIN_STUBS, A11Y_SWIFT_STUBS } from '../../../../fundamentals/a11y/src/native-plugin/stubs'
import { TABLE_KOTLIN_STUBS, TABLE_SWIFT_STUBS } from '../../../../fundamentals/table/src/native-plugin/stubs'
import { DND_KOTLIN_STUBS, DND_SWIFT_STUBS } from '../../../../fundamentals/dnd/src/native-plugin/stubs'
import { SYNC_KOTLIN_STUBS, SYNC_SWIFT_STUBS } from '../../../../fundamentals/sync/src/native-plugin/stubs'

export const REPO = resolve(import.meta.dirname, '..', '..', '..', '..', '..')

/** One plugin's stubs, per target, as the compile gates append them. */
export interface PluginStubs {
  readonly label: string
  readonly swift: string
  readonly kotlin: string
}

export const PLUGIN_STUBS: readonly PluginStubs[] = [
  { label: 'sync', swift: SYNC_SWIFT_STUBS, kotlin: SYNC_KOTLIN_STUBS },
  { label: 'dnd', swift: DND_SWIFT_STUBS, kotlin: DND_KOTLIN_STUBS },
  { label: 'table', swift: TABLE_SWIFT_STUBS, kotlin: TABLE_KOTLIN_STUBS },
  { label: 'a11y', swift: A11Y_SWIFT_STUBS, kotlin: A11Y_KOTLIN_STUBS },
  { label: 'toast', swift: TOAST_SWIFT_STUBS, kotlin: TOAST_KOTLIN_STUBS },
  { label: 'charts', swift: SWIFT_CHART_VIEW_STUBS, kotlin: KOTLIN_CHART_VIEW_STUBS },
  { label: 'flow', swift: FLOW_SWIFT_STUBS, kotlin: FLOW_KOTLIN_STUBS },
  { label: 'i18n', swift: I18N_SWIFT_STUBS, kotlin: I18N_KOTLIN_STUBS },
  { label: 'machine', swift: MACHINE_SWIFT_STUBS, kotlin: MACHINE_KOTLIN_STUBS },
  { label: 'query', swift: QUERY_SWIFT_STUBS + STREAM_SWIFT_STUBS, kotlin: QUERY_KOTLIN_STUBS + STREAM_KOTLIN_STUBS },
]

/**
 * The `native-plugin/` directories whose every `.ts` file but `stubs.ts` (and a generated blob) is an EMITTER —
 * text that can write a runtime type name into generated code. The charts plugin lists its emitter files by name
 * in the gate that scans it; a library that moves its lowering into its package adds its directory here.
 */
export const PLUGIN_EMITTER_DIRS: readonly string[] = [
  join(REPO, 'packages/fundamentals/sync/src/native-plugin'),
  join(REPO, 'packages/fundamentals/dnd/src/native-plugin'),
  join(REPO, 'packages/fundamentals/table/src/native-plugin'),
  join(REPO, 'packages/fundamentals/a11y/src/native-plugin'),
  join(REPO, 'packages/fundamentals/toast/src/native-plugin'),
  join(REPO, 'packages/fundamentals/flow/src/native-plugin'),
  join(REPO, 'packages/fundamentals/i18n/src/native-plugin'),
  join(REPO, 'packages/fundamentals/machine/src/native-plugin'),
  join(REPO, 'packages/fundamentals/query/src/native-plugin'),
]
