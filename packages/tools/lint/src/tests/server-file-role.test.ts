import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import { isServerFile } from '../utils/file-roles'

/**
 * Server-file classification is shared, and matches on word boundaries.
 *
 * Two rules independently shipped `filePath.includes('server')`. The string
 * `observer` contains `server`, so `use-intersection-observer.ts` — a
 * client-only hook, of which this repo has two — was classified as a server
 * file by both `prefer-request-context` and `no-store-outside-provider`.
 *
 * The failure mode is what makes it worth a test rather than a one-line fix:
 * a wrong role does not raise an error. It silently applies the wrong rule
 * set, which is indistinguishable from applying the right one until someone
 * reads a diagnostic that makes no sense for the file it points at.
 */

const MODULE_SIGNAL = `import { signal } from '@pyreon/reactivity'
export const seen = signal(false)
`

const fires = (filePath: string) =>
  lintFile(filePath, MODULE_SIGNAL, allRules, {
    rules: { 'pyreon/prefer-request-context': 'error' },
  }).diagnostics.length > 0

describe('isServerFile — word boundaries, not substrings', () => {
  it('does NOT match a word that merely CONTAINS "server"', () => {
    // The exact shapes that regressed. Two of these are real files here.
    expect(isServerFile('/a/src/utils/use-intersection-observer.ts')).toBe(false)
    expect(isServerFile('/a/src/utils/use-resize-observer.ts')).toBe(false)
    expect(isServerFile('/a/src/observer.ts')).toBe(false)
    expect(isServerFile('/a/src/webserver-utils.ts')).toBe(false)
  })

  it('matches a server filename stem, however it is delimited', () => {
    expect(isServerFile('/a/src/server.ts')).toBe(true)
    expect(isServerFile('/a/src/foo.server.ts')).toBe(true)
    expect(isServerFile('/a/src/entry-server.tsx')).toBe(true)
  })

  it('matches a `server/` path SEGMENT', () => {
    expect(isServerFile('/a/src/server/handler.ts')).toBe(true)
  })

  it('does not match an ordinary file', () => {
    expect(isServerFile('/a/src/helper.ts')).toBe(false)
  })
})

describe('the rules that consume it agree', () => {
  it('a client hook with a module-level signal is NOT flagged', () => {
    expect(fires('/app/src/utils/use-intersection-observer.ts')).toBe(false)
  })

  it('a real server entry still IS flagged', () => {
    expect(fires('/app/src/entry-server.ts')).toBe(true)
    expect(fires('/app/src/server/api.ts')).toBe(true)
  })

  it('no rule re-implements the classifier inline any more', () => {
    // The duplication is the defect: three copies existed, two of them wrong.
    // Asserting on the SOURCE keeps a fourth from being added quietly.
    const offenders = allRules.filter((r) => /filePath\.includes\('server'\)/.test(String(r.create)))
    expect(offenders.map((r) => r.meta.id)).toEqual([])
  })
})
