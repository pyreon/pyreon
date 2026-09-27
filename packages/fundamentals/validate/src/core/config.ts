/**
 * Runtime configuration for `@pyreon/validate`.
 *
 * The only knob today is the JIT: schemas compile to specialized functions via
 * `new Function`, which a strict Content-Security-Policy (no `'unsafe-eval'`)
 * forbids. Validation is always CORRECT without it — every schema has an
 * interpreted pipeline — so jitless mode trades speed for eval-freedom.
 */

let jitEnabled = true
let evalUnavailable = false
let warnedEvalUnavailable = false

/** Options accepted by {@link configure}. */
export interface ValidateConfig {
  /**
   * Compile schemas to specialized functions with `new Function` (default
   * `true`). Set `false` under a CSP without `'unsafe-eval'`: no code is ever
   * generated, so the browser reports no CSP violations, and every schema runs
   * on the interpreter. Affects schemas compiled AFTER the call (a schema
   * compiles lazily on its first parse).
   */
  jit?: boolean
}

/**
 * Configure `@pyreon/validate` globally.
 *
 * @example
 * import { configure } from '@pyreon/validate'
 * configure({ jit: false }) // CSP without 'unsafe-eval'
 */
export function configure(options: ValidateConfig): void {
  if (options.jit !== undefined) {
    jitEnabled = options.jit
    // Re-enabling is an explicit request to try again.
    if (options.jit) evalUnavailable = false
  }
}

/** @internal Whether the JIT may attempt code generation. */
export function jitAllowed(): boolean {
  return jitEnabled && !evalUnavailable
}

/**
 * @internal Record that the environment refused code generation (an
 * `EvalError` from `new Function`, i.e. a CSP). Every later compile skips the
 * attempt instead of paying — and reporting — one CSP violation per schema.
 */
export function markEvalUnavailable(): void {
  evalUnavailable = true
  if (process.env.NODE_ENV !== 'production' && !warnedEvalUnavailable) {
    warnedEvalUnavailable = true
    console.warn(
      "[Pyreon] @pyreon/validate: runtime code generation is blocked (likely a CSP without 'unsafe-eval'). Falling back to the interpreted validator for every schema. Call configure({ jit: false }) at startup to skip the attempt entirely.",
    )
  }
}
