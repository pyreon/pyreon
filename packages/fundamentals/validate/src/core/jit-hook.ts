/**
 * The seam between the schema compiler and the runtime JIT (`./jit`).
 *
 * `Schema._getCompiled()` calls these two bindings. They default to "the
 * emitter refused this shape" (`null`), which sends every schema through the
 * interpreted compiler. The JIT is ~3.5 KB gz, so it is installed only where it
 * is wanted:
 *
 * - the main entry (`@pyreon/validate`) installs it at load, so the chainable
 *   API keeps its speed unchanged;
 * - the size-focused `@pyreon/validate/mini` entry does NOT, and opts in with
 *   `enableJit()` from `@pyreon/validate/jit`.
 *
 * Install before the first parse: a schema compiles once and keeps the
 * validator it was first compiled with.
 */
import type * as Jit from './jit'

export let tryCompileJit: typeof Jit.tryCompileJit = () => null
export let tryCompileJitCheck: typeof Jit.tryCompileJitCheck = () => null
export let tryCompileJitFast: typeof Jit.tryCompileJitFast = () => null

/**
 * The FAILURE sentinel a `'fast'`-mode validator returns (see
 * `JitFastValidator` in `./jit`). Lives here, not in `./jit`, so the parse
 * seam in `schema.ts` can compare against it without importing the JIT.
 */
export const JIT_FAIL: unique symbol = Symbol('pyreon.validate.fail')

export function installJit(jit: {
  tryCompileJit: typeof Jit.tryCompileJit
  tryCompileJitCheck: typeof Jit.tryCompileJitCheck
  tryCompileJitFast: typeof Jit.tryCompileJitFast
}): void {
  tryCompileJit = jit.tryCompileJit
  tryCompileJitCheck = jit.tryCompileJitCheck
  tryCompileJitFast = jit.tryCompileJitFast
}
