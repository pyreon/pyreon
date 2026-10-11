// The compile-gate stub text and the emitter sources of every first-party plugin, in one place, so the gates that
// audit stubs against the real runtimes (`stub-runtime-member-parity`, `emitted-runtime-types-exist`) keep covering a
// library after its lowering moves into its package. A library that moves registers here once; without it those gates
// would silently stop reading its stubs — the failure mode of a moved stub nobody re-pointed a check at.
import { join, resolve } from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { FORM_SWIFT_STUBS, FORM_KOTLIN_STUBS } from '../../../../fundamentals/form/src/native-plugin/stubs'
import { RATE_SWIFT_STUBS, RATE_KOTLIN_STUBS } from '../../../../fundamentals/hooks/src/native-plugin/stateful-stubs'
import { storeStubs } from '../../../../fundamentals/store/src/native-plugin/stubs'
import { modelStubs } from '../../../../fundamentals/state-tree/src/native-plugin/stubs'
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
import { SIZED_MAP_KOTLIN_STUBS, SIZED_MAP_SWIFT_STUBS } from '../../../../core/sized-map/src/native-plugin/stubs'
import { STORAGE_KOTLIN_STUBS, STORAGE_SWIFT_STUBS } from '../../../../fundamentals/storage/src/native-plugin/stubs'
import { PERMISSIONS_KOTLIN_STUBS, PERMISSIONS_SWIFT_STUBS } from '../../../../fundamentals/permissions/src/native-plugin/stubs'

export const REPO = resolve(import.meta.dirname, '..', '..', '..', '..', '..')

/** One plugin's stubs, per target, as the compile gates append them. */
export interface PluginStubs {
  readonly label: string
  readonly swift: string
  readonly kotlin: string
}

export const PLUGIN_STUBS: readonly PluginStubs[] = [
  { label: 'form', swift: FORM_SWIFT_STUBS, kotlin: FORM_KOTLIN_STUBS },
  { label: 'hooks', swift: RATE_SWIFT_STUBS, kotlin: RATE_KOTLIN_STUBS },
  { label: 'store', swift: storeStubs.swift!('PyreonStoreProtocol'), kotlin: storeStubs.kotlin!('PyreonStore') },
  { label: 'state-tree', swift: modelStubs.swift!('PyreonModelProtocol'), kotlin: modelStubs.kotlin!('PyreonModelProtocol') },
  { label: 'sized-map', swift: SIZED_MAP_SWIFT_STUBS, kotlin: SIZED_MAP_KOTLIN_STUBS },
  { label: 'storage', swift: STORAGE_SWIFT_STUBS, kotlin: STORAGE_KOTLIN_STUBS },
  { label: 'permissions', swift: PERMISSIONS_SWIFT_STUBS, kotlin: PERMISSIONS_KOTLIN_STUBS },
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

/** Every package-owned source entry and its implementation directory, excluding validation stubs and generated blobs. */
export const PLUGIN_EMITTER_SOURCES: readonly string[] = (() => {
  const sources: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('stubs.ts') && !entry.name.endsWith('.generated.ts')) sources.push(path)
    }
  }
  for (const group of ['core', 'fundamentals', 'ui-system']) {
    for (const entry of readdirSync(join(REPO, 'packages', group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(REPO, 'packages', group, entry.name)
      const manifestPath = join(dir, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pyreon?: { native?: { plugin?: string } } }
      if (!manifest.pyreon?.native?.plugin) continue
      sources.push(join(dir, 'src/native-plugin.ts'))
      const implementation = join(dir, 'src/native-plugin')
      if (existsSync(implementation)) walk(implementation)
    }
  }
  return sources.sort()
})()
