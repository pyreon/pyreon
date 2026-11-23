/**
 * The indexed-read rule against review corpora (`fixtures/indexed-read/*.ts.txt`): every case compiles on both
 * toolchains and returns the web's answer, with whole numbers, `-0`, large values and integers flowing through
 * `String(…)`, templates, `+` concatenation, arithmetic and comparisons after a narrowing.
 *
 * The cases the rule deliberately leaves as a plain subscript (a use neither target can narrow: inside `&&`, or after
 * a fill that reads the binding) are listed in EXPECTED_TRAPS: natively they trap out of range exactly as they did
 * before the rule existed, and the compiler names them. Every other case must match the web.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canRunKotlinLite, canRunSwift, caseNames, emitCorpus, mismatches, runKotlinLite, runSwift, runWeb } from './differential-harness'
import { classifySwiftWarnings, VALIDATED_SWIFTC } from './swift-warning-classes'

const DIR = join(__dirname, 'fixtures/indexed-read')
/** CI's native job sets this: an absent toolchain there is a broken runner, never a skipped spec. */
const REQUIRED = process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1'

/** Cases that keep the plain read by design (named by a warning), so they trap natively where the web reads undefined. */
const EXPECTED_TRAPS: Record<string, readonly string[]> = {
  'format.ts.txt': ['c_compare'],
  'c15.ts.txt': ['c_f1_out'],
}

const corpora = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts.txt'))
  .sort()
  .map((f) => ({ file: f, src: readFileSync(join(DIR, f), 'utf8') }))

describe.each(corpora)('$file', ({ file, src }) => {
  const names = caseNames(src)
  const web = runWeb(src)
  const traps = EXPECTED_TRAPS[file] ?? []
  const compared = (native: string[]): string[] =>
    mismatches(names, web, native).filter((m) => !traps.some((t) => m.startsWith(`${t}:`)))

  it('the web answers are real (no case threw)', () => {
    for (const [i, w] of web.entries()) expect(w, names[i]).not.toMatch(/^<THROW/)
  })

  it.runIf(traps.length > 0)('a deliberate plain read is named by a warning', () => {
    const warnings = emitCorpus(src, 'swift').warnings.filter((w) => w.includes('holds an indexed read and is tested for undefined'))
    if (traps.length > 0) expect(warnings.length).toBeGreaterThanOrEqual(traps.length)
  })

  it.runIf(canRunSwift())('Swift matches the web', () => {
    expect(compared(runSwift(src))).toEqual([])
  }, 300_000)

  it.runIf(canRunKotlinLite() || REQUIRED)('Kotlin matches the web', () => {
    expect(compared(runKotlinLite(src))).toEqual([])
  }, 300_000)
})

describe('the Swift warning gate', () => {
  const known = "x.swift:1:1: warning: variable 'a' was never mutated; consider changing to 'let' constant"
  const unknown = "x.swift:2:1: warning: some diagnostic a future swiftc adds"
  it('fails on EVERY warning on the validated toolchain', () => {
    expect(classifySwiftWarnings([known, unknown], VALIDATED_SWIFTC, false).hard).toEqual([known, unknown])
  })
  it('fails on the known classes and reports the rest on another toolchain', () => {
    const r = classifySwiftWarnings([known, unknown], 'Apple Swift version 9.9 (test)', false)
    expect(r.hard).toEqual([known])
    expect(r.advisory).toEqual([unknown])
  })
})
