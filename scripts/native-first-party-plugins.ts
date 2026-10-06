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
import type { ValidateOptions } from '../packages/native/compiler/src/stub-augmentation'
import type { EmitOptions, TransformResult } from '../packages/native/compiler/src/types'
import { chartsPlugin } from '../packages/fundamentals/charts/src/native-plugin/plugin'
import { chartsStubs } from '../packages/fundamentals/charts/src/native-plugin/stubs'

export const FIRST_PARTY_PLUGINS = Object.freeze([chartsPlugin])

/** The compile gates' options with every first-party plugin's stubs appended. */
export const FIRST_PARTY_VALIDATE_OPTIONS: ValidateOptions = Object.freeze({ augment: [chartsStubs] })

const compiler = createCompiler({ discovered: FIRST_PARTY_PLUGINS })

/** `transform` with every first-party plugin loaded. */
export function transform(source: string, options: EmitOptions): TransformResult {
  return compiler.transform(source, options)
}
