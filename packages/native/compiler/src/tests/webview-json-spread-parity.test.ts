import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const fixtures = [
  ['[...xs()]', (xs: number[]) => [...xs]],
  ['[...xs(), 1e309]', (xs: number[]) => [...xs, Number.POSITIVE_INFINITY]],
  ['[...xs(), 9]', (xs: number[]) => [...xs, 9]],
  ['[9, ...xs()]', (xs: number[]) => [9, ...xs]],
  ['[...xs(), ...xs()]', (xs: number[]) => [...xs, ...xs]],
  ['[9, ...xs(), 8, ...xs(), 7]', (xs: number[]) => [9, ...xs, 8, ...xs, 7]],
  ['["", ...xs(), "quoted\\\"", null]', (xs: number[]) => ['', ...xs, 'quoted"', null]],
  ['{ rows: [...xs(), 9], empty: {} }', (xs: number[]) => ({ rows: [...xs, 9], empty: {} })],
  ['[[...xs()], [...xs(), 9]]', (xs: number[]) => [[...xs], [...xs, 9]]],
  [
    '[...xs(), [1, ...xs()], { rows: [...xs()] }]',
    (xs: number[]) => [...xs, [1, ...xs], { rows: [...xs] }],
  ],
] as const

function emitted(data: string, target: 'swift' | 'kotlin') {
  return transform(
    `import { Stack, WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1, 2])
  return <Stack><WebView html="audit" data={${data}} /></Stack>
}`,
    { target },
  )
}

function dataArgument(data: string, target: 'swift' | 'kotlin'): string {
  const result = emitted(data, target)
  const line = result.code.split('\n').find((value) => value.includes('PyreonWebView('))!
  const marker = target === 'swift' ? 'data: ' : 'data = '
  expect(line).toContain(marker)
  return line.slice(line.indexOf(marker) + marker.length, line.lastIndexOf(')'))
}

describe('WebView JSON array spread preserves web values', () => {
  it.each(['swift', 'kotlin'] as const)(
    '%s emits every nesting shape without call-spread warnings',
    (target) => {
      for (const [data] of fixtures) expect(emitted(data, target).warnings).toEqual([])
    },
  )

  it.skipIf(!isSwiftcAvailable())(
    'Swift expressions execute with the shipped serializer',
    () => {
      const dir = mkdtempSync(join(__dirname, '.json-spread-swift-'))
      try {
        const statements = fixtures
          .map(([data]) => `print(${dataArgument(data, 'swift')})`)
          .join('\n')
        writeFileSync(
          join(dir, 'main.swift'),
          `for xs: [Int] in [[], [1, 2], [3]] {\n${statements}\n}`,
        )
        execFileSync(
          'swiftc',
          [
            join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonJSON.swift'),
            join(dir, 'main.swift'),
            '-o',
            join(dir, 'run'),
          ],
          { timeout: 120_000 },
        )
        const output = execFileSync(join(dir, 'run'), { encoding: 'utf8', timeout: 30_000 })
          .trim()
          .split('\n')
        expect(output).toEqual(
          [[], [1, 2], [3]].flatMap((xs) => fixtures.map(([, web]) => JSON.stringify(web(xs)))),
        )
        const result = validateSwiftWithStubs(emitted('[9, ...xs(), 8, ...xs(), 7]', 'swift').code)
        expect(result.skipped).not.toBe(true)
        expect(result.ok, result.error).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    180_000,
  )

  it.skipIf(!isKotlincAvailable())(
    'Kotlin expressions execute with numeric array encoding',
    () => {
      const dir = mkdtempSync(join(__dirname, '.json-spread-kotlin-'))
      try {
        // Only the spread operands are encoded at runtime here, and each is an
        // Int list. The shipped serializer has its own native byte-parity suite.
        const statements = fixtures
          .map(([data]) => `println(${dataArgument(data, 'kotlin')})`)
          .join('\n')
        writeFileSync(
          join(dir, 'Main.kt'),
          `object PyreonJson { fun encode(value: List<Int>): String = value.joinToString(separator = ",", prefix = "[", postfix = "]") }\nfun main() { for (xs in listOf(emptyList<Int>(), listOf(1, 2), listOf(3))) {\n${statements}\n} }`,
        )
        execFileSync(
          'kotlinc',
          [join(dir, 'Main.kt'), '-include-runtime', '-d', join(dir, 'run.jar')],
          { timeout: 120_000 },
        )
        const output = execFileSync('kotlin', ['-classpath', join(dir, 'run.jar'), 'MainKt'], {
          encoding: 'utf8',
          timeout: 30_000,
        })
          .trim()
          .split('\n')
        expect(output).toEqual(
          [[], [1, 2], [3]].flatMap((xs) => fixtures.map(([, web]) => JSON.stringify(web(xs)))),
        )
        const result = validateKotlin(emitted('[9, ...xs(), 8, ...xs(), 7]', 'kotlin').code)
        expect(result.skipped).not.toBe(true)
        expect(result.ok, result.error).toBe(true)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    180_000,
  )
})
