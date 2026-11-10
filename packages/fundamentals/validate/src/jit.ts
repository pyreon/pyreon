/**
 * `@pyreon/validate/jit` — opt into the runtime JIT from the `mini` entry.
 *
 * The main entry installs the JIT automatically. `mini` leaves it out (about
 * 3.5 KB gz) and compiles schemas through the interpreter, which returns the
 * same results. Call `enableJit()` once, before the first parse, to get the
 * JIT's speed back:
 *
 * ```ts
 * import { enableJit } from '@pyreon/validate/jit'
 * enableJit()
 * ```
 */
import { tryCompileJit, tryCompileJitCheck, tryCompileJitFast } from './core/jit'
import { installJit } from './core/jit-hook'

export function enableJit(): void {
  installJit({ tryCompileJit, tryCompileJitCheck, tryCompileJitFast })
}
