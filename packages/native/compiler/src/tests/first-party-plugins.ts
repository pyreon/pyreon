// The first-party native plugins live in THEIR packages (`@pyreon/charts`, `@pyreon/flow`, `@pyreon/query`, …
// `src/native-plugin/`), not in this one — the compiler carries no library knowledge. These tests exercise the
// real emit through the REAL plugins, so they load them from the sibling packages' source by path rather than
// through a package dependency: those packages depend on this one, and a test-only edge back would be a cycle.
//
// The list itself is `scripts/native-first-party-plugins.ts` — the one place a moved library is registered, so the
// golden corpus, the coverage registry and these tests can never disagree about which plugins are loaded.
//
// The emit is verified HERE, not in those packages, because this package owns the toolchain
// lanes — the warm Kotlin compiler daemon, the 180s spec timeout, the real-SDK swiftc job.
import { createCompiler } from '../compiler'
import type { ServiceDescriptor } from '../services'
import type { EmitOptions, TransformResult } from '../types'
import * as validate from '../validate'
import type { ValidateOptions } from '../stub-augmentation'
import {
  FIRST_PARTY_PLUGINS,
  FIRST_PARTY_VALIDATE_OPTIONS,
} from '../../../../../scripts/native-first-party-plugins'
import { chartsPlugin } from '../../../../fundamentals/charts/src/native-plugin/plugin'
import { chartsStubs } from '../../../../fundamentals/charts/src/native-plugin/stubs'
import { flowPlugin } from '../../../../fundamentals/flow/src/native-plugin/plugin'
import { flowStubs } from '../../../../fundamentals/flow/src/native-plugin/stubs'
import { httpPlugin } from '../../../../fundamentals/http/src/native-plugin/plugin'
import { machinePlugin } from '../../../../fundamentals/machine/src/native-plugin/plugin'
import { machineStubs } from '../../../../fundamentals/machine/src/native-plugin/stubs'
import { queryPlugin } from '../../../../fundamentals/query/src/native-plugin/plugin'
import { queryStubs } from '../../../../fundamentals/query/src/native-plugin/stubs'
import { validatePlugin } from '../../../../fundamentals/validate/src/native-plugin/plugin'
import { validationPlugin } from '../../../../fundamentals/validation/src/native-plugin/plugin'
import { i18nPlugin } from '../../../../fundamentals/i18n/src/native-plugin/plugin'
import { i18nStubs } from '../../../../fundamentals/i18n/src/native-plugin/stubs'
import { toastPlugin } from '../../../../fundamentals/toast/src/native-plugin/plugin'
import { toastStubs } from '../../../../fundamentals/toast/src/native-plugin/stubs'
import { a11yPlugin } from '../../../../fundamentals/a11y/src/native-plugin/plugin'
import { a11yStubs } from '../../../../fundamentals/a11y/src/native-plugin/stubs'
import { tablePlugin } from '../../../../fundamentals/table/src/native-plugin/plugin'
import { tableStubs } from '../../../../fundamentals/table/src/native-plugin/stubs'
import { dndPlugin } from '../../../../fundamentals/dnd/src/native-plugin/plugin'
import { dndStubs } from '../../../../fundamentals/dnd/src/native-plugin/stubs'
import { kineticPlugin } from '../../../../ui-system/kinetic/src/native-plugin/plugin'
import hooksPlugin from '../../../../fundamentals/hooks/src/native-plugin'
import { featurePlugin } from '../../../../fundamentals/feature/src/native-plugin/plugin'
import { rxPlugin } from '../../../../fundamentals/rx/src/native-plugin/plugin'
import { sizedMapPlugin } from '../../../../core/sized-map/src/native-plugin/plugin'
import { sizedMapStubs } from '../../../../core/sized-map/src/native-plugin/stubs'
import { storagePlugin } from '../../../../fundamentals/storage/src/native-plugin/plugin'
import { storageStubs } from '../../../../fundamentals/storage/src/native-plugin/stubs'
import { urlStatePlugin } from '../../../../fundamentals/url-state/src/native-plugin/plugin'
import { permissionsPlugin } from '../../../../fundamentals/permissions/src/native-plugin/plugin'
import { permissionsStubs } from '../../../../fundamentals/permissions/src/native-plugin/stubs'
import { elementsPlugin } from '../../../../ui-system/elements/src/native-plugin/plugin'
import { coolgridPlugin } from '../../../../ui-system/coolgrid/src/native-plugin/plugin'
import { syncPlugin } from '../../../../fundamentals/sync/src/native-plugin/plugin'
import { syncStubs } from '../../../../fundamentals/sync/src/native-plugin/stubs'

export {
  chartsPlugin,
  chartsStubs,
  flowPlugin,
  flowStubs,
  httpPlugin,
  machinePlugin,
  machineStubs,
  queryPlugin,
  queryStubs,
  validatePlugin,
  validationPlugin,
  i18nPlugin,
  i18nStubs,
  toastPlugin,
  toastStubs,
  a11yPlugin,
  a11yStubs,
  tablePlugin,
  tableStubs,
  dndPlugin,
  dndStubs,
  syncPlugin,
  syncStubs,
  permissionsPlugin,
  permissionsStubs,
  urlStatePlugin,
  storagePlugin,
  storageStubs,
  sizedMapPlugin,
  rxPlugin,
  featurePlugin,
  hooksPlugin,
  sizedMapStubs,
  kineticPlugin,
  elementsPlugin,
  coolgridPlugin,
}

/** A compiler with the first-party plugins loaded the way the CLI loads discovered ones. */
export const firstPartyCompiler = createCompiler({ discovered: FIRST_PARTY_PLUGINS })

/** `transform` with the first-party plugins active. */
export function transform(source: string, options: EmitOptions): TransformResult {
  return firstPartyCompiler.transform(source, options)
}

/** Explicit first-party fixture stubs; callers may also provide their own plugin augmentations. */
function fixtureOptions(options?: ValidateOptions): ValidateOptions {
  return {
    augment: [
      ...new Set([...(FIRST_PARTY_VALIDATE_OPTIONS.augment ?? []), ...(options?.augment ?? [])]),
    ],
  }
}
export const validateSwiftWithStubs = (source: string, options?: ValidateOptions) =>
  validate.validateSwiftWithStubs(source, fixtureOptions(options))
export const validateSwiftFilesWithStubs = (
  sources: readonly string[],
  options?: ValidateOptions,
) => validate.validateSwiftFilesWithStubs(sources, fixtureOptions(options))
export const validateKotlin = (source: string, options?: ValidateOptions) =>
  validate.validateKotlin(source, fixtureOptions(options))
export const validateKotlinFiles = (sources: readonly string[], options?: ValidateOptions) =>
  validate.validateKotlinFiles(sources, fixtureOptions(options))

/** The `@pyreon/hooks` plain-service table as descriptors, in the plugin's own (meaningful) order. */
export const SERVICES: readonly ServiceDescriptor[] = Object.entries(hooksPlugin.services).map(
  ([hook, spec]) => ({
    ...spec,
    hook,
    legacyKind: (spec as { legacyKind?: string }).legacyKind ?? 'service',
  }),
)
