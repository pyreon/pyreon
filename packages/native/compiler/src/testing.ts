import { createCompiler } from './compiler'
import type { CompilerPlugin } from './plugin'
import type { TargetLanguage, TransformResult } from './types'

export interface TestNativePluginOptions {
  readonly target: TargetLanguage
  /** Throw when the compile reports any warning. */
  readonly requireNoWarnings?: boolean | undefined
  readonly filename?: string | undefined
}

/**
 * Compile `source` with exactly one plugin installed, for a plugin's own test.
 *
 * @example
 * const { code } = testNativePlugin(myPlugin, "const s = useMyHook()", { target: 'swift', requireNoWarnings: true })
 * expect(code).toContain('PyreonMyThing()')
 */
export function testNativePlugin(
  plugin: CompilerPlugin,
  source: string,
  options: TestNativePluginOptions,
): TransformResult {
  const result = createCompiler({ plugins: [plugin] }).transform(source, {
    target: options.target,
    ...(options.filename !== undefined ? { filename: options.filename } : {}),
  })
  if (options.requireNoWarnings === true && result.warnings.length > 0) {
    throw new Error(
      `[Pyreon] Plugin "${plugin.name}" produced ${result.warnings.length} warning(s) for ${options.target}:\n${result.warnings.map((w) => `  - ${w}`).join('\n')}`,
    )
  }
  return result
}
