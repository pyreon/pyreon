import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import * as fpEntry from '../fp'
import * as time from '../index'

/**
 * Every `@example <code> // => <value>` line in a source file's JSDoc is executed and its result compared with the value
 * after the arrow, so the examples an editor shows on hover are real. (Examples without an arrow, on types, are not run.)
 */
const SRC = join(import.meta.dirname, '..')
const FILES = readdirSync(SRC).filter((f) => f.endsWith('.ts') && f !== 'manifest.ts')

function examplesOf(file: string): { code: string; expected: string; line: number }[] {
  const out: { code: string; expected: string; line: number }[] = []

  readFileSync(join(SRC, file), 'utf8').split('\n').forEach((text, i) => {
    const m = /^\s*\*\s*@example (.*?) \/\/ => (.*)$/.exec(text)

    if (m !== null) out.push({ code: m[1]!, expected: m[2]!, line: i + 1 })
  })

  return out
}

function run(file: string, code: string, expected: string): void {
  const scope: Record<string, unknown> = file === 'fp.ts' ? { ...time, ...fpEntry } : { ...time }
  const parts = code.split('; ')
  const last = parts.pop()!
  const body = `${parts.join(';\n')}${parts.length > 0 ? ';\n' : ''}return [${last}, ${expected}]`
  const js = ts.transpileModule(body.replace(/^return /, 'return '), { compilerOptions: { target: ts.ScriptTarget.ES2022 }, reportDiagnostics: false }).outputText
  const [actual, want] = new Function(...Object.keys(scope), js.replace(/^"use strict";\n?/, ''))(...Object.values(scope)) as [unknown, unknown]

  expect(actual).toEqual(want)
}

describe('JSDoc examples run and print what they claim', () => {
  const all = FILES.flatMap((file) => examplesOf(file).map((e) => ({ file, ...e })))

  it('finds a worthwhile number of examples', () => {
    expect(all.length).toBeGreaterThan(80)
  })

  it.each(all.map((e) => [`${e.file}:${e.line} ${e.code}`, e] as const))('%s', (_name, e) => {
    run(e.file, e.code, e.expected)
    setClockOff()
  })

  it('every public export has JSDoc with an @example', () => {
    const missing: string[] = []
    const publicNames = new Set([...Object.keys(time), ...Object.keys(fpEntry).map((n) => `fp.${n}`)])

    for (const file of FILES) {
      const text = readFileSync(join(SRC, file), 'utf8')

      for (const m of text.matchAll(/((?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n)?)export (?:function|const) (\w+)/g)) {
        const name = file === 'fp.ts' ? `fp.${m[2]}` : m[2]!

        if (publicNames.has(name) && !m[1]!.includes('@example')) missing.push(`${file} ${m[2]}`)
      }
    }
    expect(missing).toEqual([])
  })
})

function setClockOff(): void {
  time.setClock(null)
}
