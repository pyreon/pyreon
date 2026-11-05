import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Hot reactive state lives on fields of module-level `const` holder objects
 * (`_t` in tracking.ts, `_b` in batch.ts, `_c` in effect.ts, `_sc` in scope.ts,
 * `_tr` in debug.ts), never in a module-level `let`.
 *
 * V8 compiles each access to a module-scope `let` from inside a function as a
 * context-slot load plus a TDZ hole check and hoists neither across calls.
 * Moving this state onto holders measured -32% computed diamond, -26% 50-deep
 * chain and -8% effect fan-out on V8 (see `TrackingFrame` in tracking.ts), at
 * zero bytes per instance. A new `let` here silently gives some of that back,
 * and no functional test notices, so the shape is locked structurally.
 */
const HOT_MODULES = [
  'tracking.ts',
  'batch.ts',
  'effect.ts',
  'scope.ts',
  'signal.ts',
  'computed.ts',
  'debug.ts',
]

/** Module-level `let`s that are deliberately NOT on the hot path. */
const ALLOWED: Record<string, string> = {
  // Read only when an effect throws.
  'effect.ts:_userErrorHandler': 'error path only',
  // `why()` debugging session state — dev tooling, never on a write/read path.
  'debug.ts:_whyActive': 'debug tooling only',
  'debug.ts:_whyLog': 'debug tooling only',
}

describe('hot reactive state is not held in module-level `let`s', () => {
  for (const file of HOT_MODULES) {
    it(file, () => {
      const src = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8')
      const lets = [...src.matchAll(/^let ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
      const unexpected = lets.filter((name) => !(`${file}:${name}` in ALLOWED))
      expect(unexpected, `move these onto the module's holder object: ${unexpected.join(', ')}`).toEqual([])
    })
  }
})
