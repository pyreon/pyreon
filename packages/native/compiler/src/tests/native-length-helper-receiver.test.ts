// `.length` over a HELPER-CALL receiver answered differently on iOS.
//
// Swift's `String.count` counts GRAPHEME CLUSTERS; JS `.length` and Kotlin
// `.length` count UTF-16 code units — `"a👍b"` is 3 vs 4. The emitter already
// knew that and emitted `.utf16.count` for a PROVABLY-string receiver, which
// covered a literal, a signal read and an annotated const. It did not cover a
// receiver produced by a function declared INSIDE a component body: that
// function's return type was never refined (only FILE-SCOPE helpers were), so
// the receiver typed `unknown`, `.count` was emitted, and the same shared
// source answered 3 on iOS and 4 on web and Android — silently, since both
// spellings compile.
//
// Three shapes were broken, all with a component-local helper: a declared
// return type, an INFERRED one, and an intermediate `const s = f()`.
//
// Verified by EXECUTION, not by reading the emit: swiftc compiles the emitted
// expression and its answer is compared against node's for the same string.
//
// Bisect-load-bearing: revert `refineComponentFnReturns` (parse.ts) or the
// component-local overlay in `buildInferenceCtx` (infer-type.ts) and the
// emit-shape specs fail with `.count` for `.utf16.count`, and the executed
// spec reports 3 where JS reports 4.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable } from '../validate'

const EMOJI = 'a👍b'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'
export function App() {
  ${body}
  return (<Stack><Text>{String(n())}</Text></Stack>)
}`

/** The three receiver shapes a component-local helper can take. */
const SHAPES: readonly (readonly [string, string])[] = [
  [
    'declared return',
    `function f(): string { return ${JSON.stringify(EMOJI)} }\n  const n = computed(() => f().length)`,
  ],
  [
    'inferred return',
    `function f() { return ${JSON.stringify(EMOJI)} }\n  const n = computed(() => f().length)`,
  ],
  [
    'via an intermediate const',
    `function f(): string { return ${JSON.stringify(EMOJI)} }\n  const s = f()\n  const n = computed(() => s.length)`,
  ],
]

const sw = (body: string) => transform(app(body), { target: 'swift' }).code
const kt = (body: string) => transform(app(body), { target: 'kotlin' }).code

describe('.length over a component-local helper call', () => {
  for (const [name, body] of SHAPES) {
    it(`Swift emits .utf16.count — ${name}`, () => {
      const code = sw(body)
      expect(code, name).toContain('.utf16.count')
      expect(code, name).not.toMatch(/\bf\(\)\.count\b/)
      expect(code, name).not.toMatch(/\(f\(\)\)\.count\b/)
    })
  }

  it('an ARRAY receiver still emits .count (the control)', () => {
    const code = sw(
      `function f(): number[] { return [1, 2, 3] }\n  const n = computed(() => f().length)`,
    )
    expect(code).toContain('.count')
    expect(code).not.toContain('utf16')
  })

  // A DECLARED return type is registered before the computeds are
  // pre-inferred, so the computed annotation is precise too. An INFERRED one
  // can only be read off the body AFTER the emitters' float-widening pass, by
  // which time the computed's own type is already cached — so its annotation
  // stays `Any` while its `.length` emit (resolved later, at expression time)
  // is correct. Pinned rather than glossed: it is the residual of this fix.
  it('a DECLARED return makes the computed type Int, not Any', () => {
    for (const name of ['declared return', 'via an intermediate const']) {
      const body = SHAPES.find(([n]) => n === name)![1]
      expect(sw(body), name).toContain('private var n: Int')
      expect(sw(body), name).not.toContain('n: Any')
    }
  })

  it('Kotlin is unaffected — .length is UTF-16 there already', () => {
    for (const [, body] of SHAPES) expect(kt(body)).toContain('.length')
  })

  // The answer, not the spelling. `"a👍b".length` is 4 on web and Android;
  // `.count` says 3 on Swift.
  it.skipIf(!isSwiftcAvailable())('executed: Swift agrees with node on a non-BMP string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-len-'))
    try {
      const exprs = SHAPES.map(([, body]) => {
        const code = sw(body)
        const line = code.split('\n').find((l) => l.includes('private var n:'))
        expect(line, 'no computed emitted').toBeDefined()
        return (line as string)
          .slice((line as string).indexOf('{') + 1, (line as string).lastIndexOf('}'))
          .trim()
      })
      const main = `import Foundation
func f() -> String { ${JSON.stringify(EMOJI)} }
let s = f()
${exprs.map((e, i) => `print(${e.replace(/\bn\b/g, 's')})`).join('\n')}
`
      writeFileSync(join(dir, 'main.swift'), main)
      execFileSync('swiftc', ['-O', join(dir, 'main.swift'), '-o', join(dir, 'run')], {
        stdio: 'pipe',
      })
      const out = execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim().split('\n')
      // node's answer for the same string — the web and Kotlin answer.
      const web = String(EMOJI.length)
      expect(out, `swift=${out.join(',')} web=${web}`).toEqual(exprs.map(() => web))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // A `<For>` ROW is typed from `each`, so it does NOT warn — the seeding
  // that makes that true is part of this fix (the row param was `unknown`,
  // which silently emitted `.count` over a `string[]`).
  it('a <For> row over a string[] emits .utf16.count and does NOT warn', () => {
    const r = transform(
      `import { Stack, Text, For } from '@pyreon/primitives'
export function App(props: { rows: string[] }) {
  return (<Stack><For each={props.rows}>{(v) => <Text>{String(v.length)}</Text>}</For></Stack>)
}`,
      { target: 'swift' },
    )
    expect(r.code).toContain('v.utf16.count')
    expect(r.warnings).toEqual([])
  })
})
