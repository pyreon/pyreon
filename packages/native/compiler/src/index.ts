// Public API for @pyreon/native-compiler.
//
// Single entry point: `transform(source, { target })` → emitted code +
// parse warnings. Internal-only (private package); not yet for consumer use.

import { emitKotlin } from './emit-kotlin'
import { emitSwift } from './emit-swift'
import { parsePyreon } from './parse'
import type { EmitOptions, TransformResult } from './types'

export type { TargetLanguage, EmitOptions, TransformResult } from './types'

export function transform(source: string, options: EmitOptions): TransformResult {
  const parsed = parsePyreon(source)
  const code =
    options.target === 'swift'
      ? emitSwift(parsed.components, parsed.enums, parsed.structs, parsed.moduleDecls)
      : emitKotlin(parsed.components, parsed.enums, parsed.structs, parsed.moduleDecls)
  return { code, warnings: parsed.warnings }
}
