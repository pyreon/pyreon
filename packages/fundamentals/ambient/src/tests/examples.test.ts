import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import * as ambient from '../index'
import manifest from '../manifest'

/**
 * Executes every `// =>` line of the manifest examples and every `@example <code> // => <value>` line of the source JSDoc,
 * so the output the docs and the editor show is the output the package produces.
 */
function run(code: string, expected: string): void {
  const names = Object.keys(ambient)
  const parts = code.split('; ')
  const last = parts.pop()!
  const body = `${parts.join(';\n')}${parts.length > 0 ? ';\n' : ''}return [${last}, ${expected}]`
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^"use strict";\n?/, '')
  const [actual, want] = new Function(...names, js)(...names.map((n) => (ambient as Record<string, unknown>)[n])) as [unknown, unknown]

  expect(actual).toEqual(want)
}

function manifestLines(example: string): { code: string; expected: string }[] {
  const lines = example.split('\n')
  const out: { code: string; expected: string }[] = []
  const setup: string[] = []

  for (const line of lines) {
    const m = /^(.*?)\s+\/\/ => (.*)$/.exec(line)

    if (line.startsWith('import ') || line.trim().startsWith('//') || line.trim() === '') continue
    if (m === null) setup.push(line)
    else out.push({ code: [...setup, m[1]!].join('; '), expected: m[2]! })
  }

  return out
}

describe('examples run and print what they claim', () => {
  afterEach(() => {
    ambient.setClock(null)
  })

  const fromManifest = manifest.api.filter((a) => a.kind !== 'type' && a.example !== undefined).flatMap((a) => manifestLines(a.example!).map((l) => [`${a.name}: ${l.code}`, l] as const))

  it.each(fromManifest)('manifest %s', (_name, l) => {
    run(l.code, l.expected)
  })

  const sources = ['locale.ts', 'clock.ts']
  const fromSource = sources.flatMap((file) =>
    readFileSync(join(import.meta.dirname, '..', file), 'utf8')
      .split('\n')
      .flatMap((text) => {
        const m = /^\s*\*\s*@example (.*?) \/\/ => (.*)$/.exec(text)

        return m === null ? [] : [[`${file}: ${m[1]}`, { code: m[1]!, expected: m[2]! }] as const]
      }),
  )

  it.each(fromSource)('jsdoc %s', (_name, l) => {
    run(l.code, l.expected)
  })

  it('every runtime export is documented in the manifest, and has JSDoc', () => {
    const documented = new Set<string>(manifest.api.map((a) => a.name))

    expect(Object.keys(ambient).filter((n) => !documented.has(n))).toEqual([])
    for (const file of sources) {
      const text = readFileSync(join(import.meta.dirname, '..', file), 'utf8')

      for (const m of text.matchAll(/((?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n)?)export function (\w+)/g)) {
        if (Object.hasOwn(ambient, m[2]!)) expect(m[1], `${file} ${m[2]} has no JSDoc`).toContain('@example')
      }
    }
  })
})
