import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rxPlugin, transform } from './first-party-plugins'
import type { ModuleScan } from '../plugin-api'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
  validateSwiftTypecheck,
} from '../validate'

const app = (imports: string, expression: string) => `
import { signal, computed } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
${imports}
export function App() {
  const ids = signal<number[]>([1, 2, 3, 4])
  const selected = ${expression}
  return <Text>{selected().length}</Text>
}`

const cases = [
  ['namespace', "import { rx } from '@pyreon/rx'", 'rx.take(rx.reverse(ids), 2)'],
  [
    'namespace alias',
    "import { rx as streams } from '@pyreon/rx'",
    'streams.take(streams.reverse(ids), 2)',
  ],
  [
    'module namespace',
    "import * as streams from '@pyreon/rx'",
    'streams.take(streams.reverse(ids), 2)',
  ],
  [
    'standalone aliases',
    "import { take as head, reverse as backwards } from '@pyreon/rx'",
    'head(backwards(ids), 2)',
  ],
  [
    'computed expression',
    "import { rx } from '@pyreon/rx'",
    'computed(() => rx.take(rx.reverse(ids), 2)())',
  ],
] as const

describe('native rx composition', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    describe(`nested rx transforms (${target})`, () => {
      it.each(cases)('%s lowers recursively to collection values', (_name, imports, expression) => {
        const result = transform(app(imports, expression), { target })
        expect(result.warnings).toEqual([])
        expect(result.code).toContain(
          target === 'swift' ? 'Array(ids.reversed().prefix(2))' : 'ids.reversed().take(2)',
        )
        expect(result.code).not.toMatch(/(?:rx|streams|head|backwards)\s*[.(]/)
        expect(result.code).not.toContain('reversed()()')
      })

      it('handles three transform layers with a typed callback', () => {
        const result = transform(
          app(
            "import { rx } from '@pyreon/rx'",
            'rx.take(rx.reverse(rx.filter(ids, (id) => id > 1)), 2)',
          ),
          { target },
        )
        expect(result.warnings).toEqual([])
        expect(result.code).toContain(
          target === 'swift'
            ? 'Array(ids.filter({ id in id > 1 }).reversed().prefix(2))'
            : 'ids.filter({ id -> id > 1L }).reversed().take(2)',
        )
      })

      it('does not claim a foreign namespace named rx', () => {
        const result = transform(app("import { rx } from '@other/rx'", 'rx.reverse(ids)'), {
          target,
        })
        expect(result.code).not.toContain('.reversed()')
        expect(result.warnings.join('\n')).not.toContain('rx.take')
      })

      it.each([
        ['rx', "import { rx } from '@pyreon/rx'", 'rx.reverse(ids)'],
        ['backwards', "import { reverse as backwards } from '@pyreon/rx'", 'backwards(ids)'],
      ])('does not claim the shadowed %s import', (name, imports, expression) => {
        const source = app(imports, expression).replace(
          'function App()',
          `function App(${name}: any)`,
        )
        const result = transform(source, { target })
        expect(result.code).not.toContain('.reversed()')
      })
    })
  }

  it('nested transforms compile with real Swift', (context) => {
    if (!isSwiftcAvailable()) {
      context.skip()
      return
    }
    for (const [name, imports, expression] of [
      ...cases,
      ['indexed composition', "import { rx } from '@pyreon/rx'", 'rx.unique(rx.reverse(ids))'],
    ] as const) {
      const output = transform(app(imports, expression), { target: 'swift' })
      const result = validateSwiftWithStubs(output.code)
      expect(result.ok, `${name}: ${result.error ?? ''}`).toBe(true)
    }
  })

  it('nested transforms compile with real Kotlin', (context) => {
    if (!isKotlincAvailable()) {
      context.skip()
      return
    }
    for (const [name, imports, expression] of [
      ...cases,
      ['indexed composition', "import { rx } from '@pyreon/rx'", 'rx.unique(rx.reverse(ids))'],
    ] as const) {
      const output = transform(app(imports, expression), { target: 'kotlin' })
      const result = validateKotlin(output.code)
      expect(result.ok, `${name}: ${result.error ?? ''}`).toBe(true)
    }
  })

  // Execute the emitted collection expression unchanged. These checks cover value/order and fresh reads after mutation;
  // component compilation above checks its integration, while native framework observation is outside this harness.
  const runtimeSource = app("import { rx } from '@pyreon/rx'", 'rx.take(rx.reverse(ids), 2)')
  const uniqueSource = app("import { rx } from '@pyreon/rx'", 'rx.unique(rx.reverse(ids))')

  it('an older compiler fails with an upgrade instruction instead of silently declining every call', () => {
    expect(() => rxPlugin.scanModule?.({} as ModuleScan)).toThrow(
      'Upgrade @pyreon/native-compiler together with @pyreon/rx',
    )
  })

  it('nested transforms compile against the real SwiftUI SDK', (context) => {
    if (!isSwiftUIAvailable()) {
      context.skip()
      return
    }
    const result = validateSwiftTypecheck(transform(runtimeSource, { target: 'swift' }).code)
    expect(result.ok, result.error ?? '').toBe(true)
  })

  it('Swift executes the emitted nested transforms after source updates', (context) => {
    if (!isSwiftcAvailable()) {
      context.skip()
      return
    }
    const code = transform(runtimeSource, { target: 'swift' }).code
    const expression = code.match(/^  private var selected: \[Int\] \{ (.*) \}$/m)?.[1]
    expect(expression, code).toBeDefined()
    const uniqueCode = transform(uniqueSource, { target: 'swift' }).code
    const uniqueExpression = uniqueCode.match(
      /^  private var selected: \[[^\]]+\] \{ (.*) \}$/m,
    )?.[1]
    expect(uniqueExpression, uniqueCode).toBeDefined()
    const directory = mkdtempSync(join(tmpdir(), 'pyreon-rx-execute-'))
    try {
      const source = join(directory, 'main.swift')
      const binary = join(directory, 'rx')
      writeFileSync(
        source,
        `var ids = [1, 2, 3, 4]
func selected() -> [Int] { return ${expression} }
func unique() -> [Int] { return ${uniqueExpression} }
precondition(selected() == [4, 3])
ids = [7, 8, 9]
precondition(selected() == [9, 8])
ids = []
precondition(selected().isEmpty)
`,
      )
      execFileSync('swiftc', [source, '-o', binary], { stdio: 'pipe', timeout: 90_000 })
      execFileSync(binary, { stdio: 'pipe', timeout: 10_000 })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  const javaAvailable =
    spawnSync('java', ['-version'], { stdio: 'ignore', timeout: 10_000 }).status === 0
  if (process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1' && !javaAvailable) {
    throw new Error(
      '[Pyreon] Native rx execution requires Java; configure JAVA_HOME and PATH to a working JDK.',
    )
  }
  it('Kotlin executes the emitted nested transforms after source updates', (context) => {
    if (!isKotlincAvailable() || !javaAvailable) {
      context.skip()
      return
    }
    const code = transform(runtimeSource, { target: 'kotlin' }).code
    const expression = code.match(
      /^  val selected by remember \{ derivedStateOf \{ (.*) \} \}$/m,
    )?.[1]
    expect(expression, code).toBeDefined()
    const uniqueCode = transform(uniqueSource, { target: 'kotlin' }).code
    const uniqueExpression = uniqueCode.match(
      /^  val selected by remember \{ derivedStateOf \{ (.*) \} \}$/m,
    )?.[1]
    expect(uniqueExpression, uniqueCode).toBeDefined()
    const directory = mkdtempSync(join(tmpdir(), 'pyreon-rx-execute-'))
    try {
      const source = join(directory, 'Main.kt')
      const jar = join(directory, 'rx.jar')
      writeFileSync(
        source,
        `fun main() {
  var ids = listOf(1L, 2L, 3L, 4L)
  fun selected(): List<Long> = ${expression}
  fun unique(): List<Long> = ${uniqueExpression}
  check(selected() == listOf(4L, 3L))
  ids = listOf(7L, 8L, 9L)
  check(selected() == listOf(9L, 8L))
  ids = emptyList()
  check(selected().isEmpty())
  ids = listOf(3L, 1L, 2L, 3L)
  check(unique() == listOf(3L, 2L, 1L))
}
`,
      )
      execFileSync('kotlinc', [source, '-include-runtime', '-d', jar], {
        stdio: 'pipe',
        timeout: 90_000,
      })
      execFileSync('java', ['-jar', jar], { stdio: 'pipe', timeout: 10_000 })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
