// The `@pyreon/charts` native plugin lives in `@pyreon/charts` (`src/native-plugin/`), not in this
// package — the compiler carries no library knowledge. These tests exercise the chart emit through
// the REAL plugin, so they load it from the sibling package's source by path (the same way
// `native-chart-mirror-parity.test.ts` reads the engine) rather than through a package dependency:
// `@pyreon/charts` depends on this package, and a test-only edge back would be a cycle.
//
// The chart emit is verified HERE, not in `@pyreon/charts`, because this package owns the toolchain
// lanes — the warm Kotlin compiler daemon, the 180s spec timeout, the real-SDK swiftc job.
import { createCompiler } from '../compiler'
import type { ValidateOptions } from '../stub-augmentation'
import type { EmitOptions, TransformResult } from '../types'
import * as validate from '../validate'
import { chartsPlugin } from '../../../../fundamentals/charts/src/native-plugin/plugin'
import { chartsStubs } from '../../../../fundamentals/charts/src/native-plugin/stubs'

export { chartsPlugin, chartsStubs }

/** A compiler with the charts plugin loaded the way the CLI loads a discovered one. */
export const chartsCompiler = createCompiler({ discovered: [chartsPlugin] })

/** `transform` with the charts plugin active. */
export function transform(source: string, options: EmitOptions): TransformResult {
  return chartsCompiler.transform(source, options)
}

const augment: ValidateOptions = { augment: [chartsStubs] }

/** The compile gates, with the charts stubs appended for inputs that name a chart canvas. */
export const validateSwiftWithStubs = (source: string) => validate.validateSwiftWithStubs(source, augment)
export const validateSwiftFilesWithStubs = (sources: readonly string[]) => validate.validateSwiftFilesWithStubs(sources, augment)
export const validateKotlin = (source: string) => validate.validateKotlin(source, augment)
export const validateKotlinFiles = (sources: readonly string[]) => validate.validateKotlinFiles(sources, augment)
