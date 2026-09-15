/**
 * `scripts/bootstrap-attribution.ts` — bootstrap must record a package's
 * source hash as "built" only on evidence. The batch build's exit code is one
 * boolean for N packages; the lib/ postcondition is mtime-based (blind when CI
 * restores lib/ newer than src/) and returns null for packages producing no
 * lib/. Pre-fix a failed build was therefore recorded as successful and
 * skipped on every later run. The attribution reads bun's own per-package
 * verdict lines back out of the captured output.
 */
import { describe, expect, it } from 'vitest'
import { attributeBuildFailures } from '../../../../../scripts/bootstrap-attribution'

const OUTPUT = `@pyreon/core build: vl_rolldown_build
@pyreon/core build: built lib/ in 1.2s
@fake/a build: error TS2304: Cannot find name 'x'.
@fake/a build: Exited with code 7
@pyreon/native-runtime-kotlin build: Signaled with code SIGKILL
@pyreon/head build: Exited with code 0
`

describe('attributeBuildFailures', () => {
  it('names every package whose script exited non-zero or was signaled', () => {
    expect([...attributeBuildFailures(OUTPUT)].sort()).toEqual(['@fake/a', '@pyreon/native-runtime-kotlin'])
  })

  it('a clean batch attributes nothing (exit 0 lines are not failures)', () => {
    expect(attributeBuildFailures('@pyreon/head build: Exited with code 0\n').size).toBe(0)
    expect(attributeBuildFailures('').size).toBe(0)
  })

  it('does not match the token mid-line (a build LOGGING the phrase is not a verdict)', () => {
    expect(attributeBuildFailures('@x/y build: warning: Exited with code 3 seen in fixture\n').size).toBe(0)
  })
})
