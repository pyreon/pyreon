import ts from 'typescript'
import * as time from '../index'
import * as fpEntry from '../fp'
import manifest from '../manifest'

/**
 * Executes every example in the manifest. A line `expr // => expected` must evaluate to `expected` (a JS literal, compared
 * deeply); `const x = expr // => expected` binds and checks. Other lines run as statements. So the output the docs show is
 * the output the package produces.
 */
function runExample(source: string, scope: Record<string, unknown> = time): void {
  const names = Object.keys(scope)
  const lines = source.split('\n')
  const body: string[] = []

  lines.forEach((line, i) => {
    const m = /^(.*?)\s+\/\/ => (.*)$/.exec(line)

    if (m === null) {
      body.push(line)

      return
    }
    const decl = /^(const|let)\s+(\w+)\s*=\s*(.*)$/.exec(m[1]!)

    if (decl !== null) body.push(`${decl[1]} ${decl[2]} = ${decl[3]}; __check(${decl[2]}, ${m[2]}, ${i + 1})`)
    else body.push(`__check(${m[1]}, ${m[2]}, ${i + 1})`)
  })
  const check = (actual: unknown, expected: unknown, line: number): void => {
    expect(actual, `example line ${line}`).toEqual(expected)
  }
  // The examples are TypeScript (annotations, `!`): transpile them, then run as JavaScript.
  const js = ts.transpileModule(body.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

  new Function('__check', ...names, js)(check, ...names.map((n) => scope[n]))
}

describe('manifest examples run and print what they claim', () => {
  const entries = [...manifest.api.filter((a) => a.kind !== 'type' && a.example !== undefined).map((a) => [a.name, a.example!] as const), ['longExample', manifest.longExample!] as const]

  it.each(entries)('%s', (name, example) => {
    const stripped = example.replace(/^import .*$/gm, '')

    runExample(stripped, name.startsWith('fp.') || example.includes("from '@pyreon/time/fp'") ? { ...time, ...fpEntry } : time)
  })

  it('every runtime export of the package has an api entry, and every function entry is exported', () => {
    const documented = new Set<string>(manifest.api.map((a) => a.name.replace(/^fp\./, '')))
    const exported: string[] = [...Object.keys(time), ...Object.keys(fpEntry)]

    expect(exported.filter((n) => !documented.has(n))).toEqual([])
    expect(manifest.api.filter((a) => a.kind === 'function' && !exported.includes(a.name.replace(/^fp\./, ''))).map((a) => a.name)).toEqual([])
  })
})
