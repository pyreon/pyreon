// Package Swift sources that are compiled INTO the app target must spell
// Swift's task type `_Concurrency.Task`.
//
// A package's `native/swift/*.swift` is not a module of its own: the example
// apps (and user apps) compile it into the app target next to the generated
// code. `examples/native-tasks` generates a model named `Task`, which shadows
// Swift's: `Task { … }` then resolves to the model's `init(from: Decoder)`
// and the build fails with "argument type '_' does not conform to expected
// type 'any Decoder'" (PR #4772, `PyreonWebView.swift`). The package-local
// Swift gates compile these files alone and cannot see the clash.
// `PyreonRateLimit.swift` already used the qualified name for this reason.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repo = `${resolve(import.meta.dirname, '../../../../..')}/`

/** Every `native/swift/*.swift` under packages/ (not `native/tests`, not SwiftPM modules). */
function appCompiledSwift(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'lib' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...appCompiledSwift(p))
    else if (name.endsWith('.swift') && p.includes('/native/swift/')) out.push(p)
  }

  return out
}

/** The source with comments and string literals removed. */
const code = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')

describe('app-compiled package Swift qualifies Task', () => {
  const files = appCompiledSwift(join(repo, 'packages'))

  it('finds the package Swift sources', () => {
    expect(files.some((f) => f.endsWith('/hooks/native/swift/PyreonWebView.swift'))).toBe(true)
  })

  it('never names a bare Task', () => {
    const bare = files.flatMap((f) =>
      code(readFileSync(f, 'utf8'))
        .split('\n')
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => /(?<![\w.])Task\s*(?:\{|\(|\.|<)/.test(l))
        .map(({ i }) => `${f.slice(repo.length)}:${i + 1}`),
    )
    expect(bare, 'write _Concurrency.Task: an app type named Task shadows it').toEqual([])
  })
})
