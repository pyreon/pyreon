// The first-party native plugins live in THEIR packages (`@pyreon/charts`, `@pyreon/flow`
// `src/native-plugin/`), not in this one — the compiler carries no library knowledge. These tests
// exercise the real emit through the REAL plugins, so they load them from the sibling packages'
// source by path (the same way `native-chart-mirror-parity.test.ts` reads the engine) rather than
// through a package dependency: both packages depend on this one, and a test-only edge back would
// be a cycle.
//
// The emit is verified HERE, not in those packages, because this package owns the toolchain
// lanes — the warm Kotlin compiler daemon, the 180s spec timeout, the real-SDK swiftc job.
import { createCompiler } from '../compiler'
import type { ValidateOptions } from '../stub-augmentation'
import type { EmitOptions, TransformResult } from '../types'
import * as validate from '../validate'
import { chartsPlugin } from '../../../../fundamentals/charts/src/native-plugin/plugin'
import { chartsStubs } from '../../../../fundamentals/charts/src/native-plugin/stubs'
import { flowPlugin } from '../../../../fundamentals/flow/src/native-plugin/plugin'
import { flowStubs } from '../../../../fundamentals/flow/src/native-plugin/stubs'
import { httpPlugin } from '../../../../fundamentals/http/src/native-plugin/plugin'
import { queryPlugin } from '../../../../fundamentals/query/src/native-plugin/plugin'
import { queryStubs } from '../../../../fundamentals/query/src/native-plugin/stubs'
import { validatePlugin } from '../../../../fundamentals/validate/src/native-plugin/plugin'
import { validationPlugin } from '../../../../fundamentals/validation/src/native-plugin/plugin'

export { chartsPlugin, chartsStubs, flowPlugin, flowStubs, httpPlugin, queryPlugin, queryStubs, validatePlugin, validationPlugin }

/** A compiler with the first-party plugins loaded the way the CLI loads discovered ones. */
export const firstPartyCompiler = createCompiler({ discovered: [chartsPlugin, flowPlugin, httpPlugin, queryPlugin, validatePlugin, validationPlugin] })

/** `transform` with the first-party plugins active. */
export function transform(source: string, options: EmitOptions): TransformResult {
  return firstPartyCompiler.transform(source, options)
}

const augment: ValidateOptions = { augment: [chartsStubs, flowStubs, queryStubs] }

/** The compile gates, with the first-party stubs appended for inputs that name a plugin's runtime types. */
export const validateSwiftWithStubs = (source: string) => validate.validateSwiftWithStubs(source, augment)
export const validateSwiftFilesWithStubs = (sources: readonly string[]) => validate.validateSwiftFilesWithStubs(sources, augment)
export const validateKotlin = (source: string) => validate.validateKotlin(source, augment)
export const validateKotlinFiles = (sources: readonly string[]) => validate.validateKotlinFiles(sources, augment)
