/**
 * Guard for the classic TypeScript Compiler API removed in TypeScript 7 ("tsgo").
 *
 * Background: `@pyreon/compiler`'s detectors/audits/migrators parse with
 * `ts.createSourceFile(f, code, ts.ScriptTarget.ESNext, …)`. TS7 dropped
 * `ScriptTarget`/`createSourceFile`, so on TS7 that line throws the cryptic
 * `Cannot read properties of undefined (reading 'ESNext')` — the crash a fresh
 * `bunx @pyreon/mcp` hit once the uncapped `typescript: ">=5.0.0"` range began
 * resolving to 7.x. Ranges are now capped `<7`; `assertClassicTs()` converts a
 * force-pinned TS7 into an actionable message instead of the cryptic deref.
 *
 * Bisect: make `assertClassicTs` a no-op (`return`) → the TS7-shape test no
 * longer throws and its assertion fails.
 */
import { describe, expect, it } from 'vitest'
import { assertClassicTs } from '../ts'

/** Synthetic TS7-shaped module: no classic Compiler API (`ScriptTarget` absent). */
const TS7 = { version: '7.0.2', isCallExpression: () => false }

/** Synthetic TS 6-shaped module: classic API present. */
const TS6 = {
  version: '6.0.3',
  ScriptTarget: { ESNext: 99, Latest: 99 },
  createSourceFile: () => ({ kind: 'sourceFile' }),
}

describe('assertClassicTs — TypeScript 7 diagnosis', () => {
  it('throws an actionable [Pyreon] error on a TS7-shaped module', () => {
    expect(() => assertClassicTs(TS7)).toThrow(
      /\[Pyreon\].*TypeScript 5\.x or 6\.x.*7\.0\.2.*ScriptTarget.*>=5\.0\.0 <7\.0\.0/s,
    )
  })

  it('is a no-op on TS 5.x/6.x (classic API present)', () => {
    expect(() => assertClassicTs(TS6)).not.toThrow()
  })

  it('defaults to the installed TypeScript when no module is passed (repo pins 6.x → no throw)', () => {
    // The repo pins typescript 6.x, which has the classic API, so the default
    // path must not throw. (If a maintainer ever force-installs TS7 locally,
    // this is exactly the guard that would fire with the message above.)
    expect(() => assertClassicTs()).not.toThrow()
  })
})
