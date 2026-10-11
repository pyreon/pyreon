/**
 * The first-party native-compiler plugins a repo script needs, the way the CLI
 * has them once an app's imports activate them.
 *
 * `@pyreon/native-compiler` carries no library knowledge: a library ships its
 * lowering as a plugin in its own package, and `@pyreon/native-cli` discovers it
 * from `package.json` (`pyreon.native.plugin`) when a source file imports the
 * package. A repo script that compiles every library's snippet in ONE process
 * (the golden corpus, the coverage registry, the emit-size baseline) has no app
 * to discover from, so it loads the plugins directly from source — the same
 * objects the CLI would import from `lib/`.
 *
 * Add a plugin here when another library moves its lowering into its package.
 */
import { createCompiler } from '../packages/native/compiler/src/compiler'
import type { CompilerPlugin } from '../packages/native/compiler/src/plugin'
import type { ServiceDescriptor } from '../packages/native/compiler/src/services'
import type { ValidateOptions } from '../packages/native/compiler/src/stub-augmentation'
import type { EmitOptions, TransformResult } from '../packages/native/compiler/src/types'
import { chartsPlugin } from '../packages/fundamentals/charts/src/native-plugin/plugin'
import { chartsStubs } from '../packages/fundamentals/charts/src/native-plugin/stubs'
import { flowPlugin } from '../packages/fundamentals/flow/src/native-plugin/plugin'
import { flowStubs } from '../packages/fundamentals/flow/src/native-plugin/stubs'
import { httpPlugin } from '../packages/fundamentals/http/src/native-plugin/plugin'
import { queryPlugin } from '../packages/fundamentals/query/src/native-plugin/plugin'
import { queryStubs } from '../packages/fundamentals/query/src/native-plugin/stubs'
import { validatePlugin } from '../packages/fundamentals/validate/src/native-plugin/plugin'
import { validationPlugin } from '../packages/fundamentals/validation/src/native-plugin/plugin'
import { machinePlugin } from '../packages/fundamentals/machine/src/native-plugin/plugin'
import { machineStubs } from '../packages/fundamentals/machine/src/native-plugin/stubs'
import { i18nPlugin } from '../packages/fundamentals/i18n/src/native-plugin/plugin'
import { i18nStubs } from '../packages/fundamentals/i18n/src/native-plugin/stubs'
import { toastPlugin } from '../packages/fundamentals/toast/src/native-plugin/plugin'
import { toastStubs } from '../packages/fundamentals/toast/src/native-plugin/stubs'
import { a11yPlugin } from '../packages/fundamentals/a11y/src/native-plugin/plugin'
import { a11yStubs } from '../packages/fundamentals/a11y/src/native-plugin/stubs'
import { tablePlugin } from '../packages/fundamentals/table/src/native-plugin/plugin'
import { tableStubs } from '../packages/fundamentals/table/src/native-plugin/stubs'
import { dndPlugin } from '../packages/fundamentals/dnd/src/native-plugin/plugin'
import { dndStubs } from '../packages/fundamentals/dnd/src/native-plugin/stubs'
import { kineticPlugin } from '../packages/ui-system/kinetic/src/native-plugin/plugin'
import { storePlugin } from '../packages/fundamentals/store/src/native-plugin/plugin'
import { storeStubs } from '../packages/fundamentals/store/src/native-plugin/stubs'
import { stateTreePlugin } from '../packages/fundamentals/state-tree/src/native-plugin/plugin'
import { modelStubs } from '../packages/fundamentals/state-tree/src/native-plugin/stubs'
import hooksPlugin from '../packages/fundamentals/hooks/src/native-plugin'
import { featurePlugin } from '../packages/fundamentals/feature/src/native-plugin/plugin'
import { rxPlugin } from '../packages/fundamentals/rx/src/native-plugin/plugin'
import { sizedMapPlugin } from '../packages/core/sized-map/src/native-plugin/plugin'
import { sizedMapStubs } from '../packages/core/sized-map/src/native-plugin/stubs'
import { storagePlugin } from '../packages/fundamentals/storage/src/native-plugin/plugin'
import { storageStubs } from '../packages/fundamentals/storage/src/native-plugin/stubs'
import { urlStatePlugin } from '../packages/fundamentals/url-state/src/native-plugin/plugin'
import { permissionsPlugin } from '../packages/fundamentals/permissions/src/native-plugin/plugin'
import { permissionsStubs } from '../packages/fundamentals/permissions/src/native-plugin/stubs'
import { elementsPlugin } from '../packages/ui-system/elements/src/native-plugin/plugin'
import { coolgridPlugin } from '../packages/ui-system/coolgrid/src/native-plugin/plugin'
import { syncPlugin } from '../packages/fundamentals/sync/src/native-plugin/plugin'
import { syncStubs } from '../packages/fundamentals/sync/src/native-plugin/stubs'

export const FIRST_PARTY_PLUGINS: readonly CompilerPlugin[] = Object.freeze([stateTreePlugin, storePlugin, chartsPlugin, flowPlugin, httpPlugin, machinePlugin, queryPlugin, validatePlugin, validationPlugin, i18nPlugin, toastPlugin, a11yPlugin, tablePlugin, dndPlugin, syncPlugin, permissionsPlugin, urlStatePlugin, storagePlugin, sizedMapPlugin, rxPlugin, featurePlugin, hooksPlugin, kineticPlugin, elementsPlugin, coolgridPlugin])

/** The compile gates' options with every first-party plugin's stubs appended. */
export const FIRST_PARTY_VALIDATE_OPTIONS: ValidateOptions = Object.freeze({ augment: [modelStubs, storeStubs, chartsStubs, flowStubs, machineStubs, queryStubs, i18nStubs, toastStubs, a11yStubs, tableStubs, dndStubs, syncStubs, permissionsStubs, storageStubs, sizedMapStubs] })

const compiler = createCompiler({ discovered: FIRST_PARTY_PLUGINS })

/** `transform` with every first-party plugin loaded. */
export function transform(source: string, options: EmitOptions): TransformResult {
  return compiler.transform(source, options)
}

/** The `@pyreon/hooks` plain-service table as descriptors, in the plugin's own (meaningful) order. */
export const HOOKS_SERVICE_DESCRIPTORS: readonly ServiceDescriptor[] = Object.entries(hooksPlugin.services).map(([hook, spec]) => ({
  ...spec,
  hook,
  legacyKind: (spec as { legacyKind?: string }).legacyKind ?? 'service',
}))
