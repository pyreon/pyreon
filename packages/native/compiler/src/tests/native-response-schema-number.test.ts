import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * A decoded model's `number` fields follow the endpoint's RESPONSE SCHEMA.
 *
 * A TS `number` carries no int/float distinction, so PMTC types it `Int` on
 * Swift and `Long` on Kotlin by default (Swift's `Int` is 64-bit on every
 * Apple target, so `Long` is Kotlin's matching width — see `KOTLIN_INT` in
 * emit-kotlin.ts). For a model DECODED from a response that default is wrong
 * whenever the wire value can be fractional: `JSONDecoder` and kotlinx both
 * REJECT `4.5` for an integer type, so the native app failed to decode a
 * payload the web parsed. Every Lathe-generated model with an OpenAPI
 * `type: number` field hit this — Lathe emits `s.number()` for `number` and
 * `s.number().int()` for `integer`, and that schema is the only place the
 * distinction survives.
 *
 * The emit specs pin the typing; the execution specs DECODE a fractional
 * payload with the real `JSONDecoder` and the real kotlinx serializer, into
 * the struct PMTC emitted, because "the field says Double" is a claim about
 * text and "4.5 decodes" is the behaviour.
 */

const MODULE = (typeArg: string, response: string): string => `
import { createHttp } from '@pyreon/http'
import { standardSchema } from '@pyreon/http/schema'
import { useQuery } from '@pyreon/query'
import { s } from '@pyreon/validate'
const api = createHttp({ baseUrl: 'http://localhost:5199/v1', schema: standardSchema })
export const book_schema = s.object({
  id: s.string(),
  pages: s.number().int().min(1).optional(),
  rating: s.number().min(0).max(5).optional(),
  price: s.number(),
  scores: s.array(s.number()),
  counts: s.array(s.number().int()),
  shelf: s.object({ label: s.string(), weight: s.number() }).optional(),
})
export type Shelf = { label: string; weight: number }
export type Book = {
  id: string
  pages?: number | undefined
  rating?: number | undefined
  price: number
  scores: number[]
  counts: number[]
  shelf?: Shelf | undefined
}
export const getBook = api.endpoint('GET /books/:bookId', { response: ${response} })
export function BookData(props: { bookId: string; children: (data: ${typeArg} | undefined) => unknown }) {
  const q = useQuery<${typeArg}>(() => getBook.query({ params: { bookId: props.bookId } }))
  return () => props.children(q.data())
}
`

const SINGLE = MODULE('Book', 'book_schema')

function swiftStruct(code: string, name: string): string {
  const m = code.match(new RegExp(`struct ${name}: Codable \\{[^}]*\\}`))
  expect(m, `struct ${name} not emitted`).not.toBeNull()
  return m![0]
}
function kotlinClass(code: string, name: string): string {
  const m = code.match(new RegExp(`@Serializable\\s*data class ${name}\\([^)]*\\)`))
  expect(m, `data class ${name} not emitted`).not.toBeNull()
  return m![0]
}

describe('decode struct number fields follow the response schema', () => {
  it('Swift: s.number() → Double, s.number().int() → Int (fields, arrays, nested)', () => {
    const r = transform(SINGLE, { target: 'swift' })
    expect(r.warnings).toEqual([])
    const book = swiftStruct(r.code, 'Book')
    expect(book).toContain('var rating: Double? = nil')
    expect(book).toContain('var price: Double')
    expect(book).toContain('var scores: [Double]')
    expect(book).toContain('var pages: Int? = nil')
    expect(book).toContain('var counts: [Int]')
    expect(swiftStruct(r.code, 'Shelf')).toContain('var weight: Double')
  })

  it('Kotlin: s.number() → Double, s.number().int() → Long (fields, arrays, nested)', () => {
    const r = transform(SINGLE, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    const book = kotlinClass(r.code, 'Book')
    expect(book).toContain('var rating: Double? = null')
    expect(book).toContain('var price: Double')
    expect(book).toContain('var scores: List<Double>')
    // Integer (non-fractional) fields are Long on Kotlin, not Int — the
    // KOTLIN_INT default matches Swift's 64-bit Int (see emit-kotlin.ts).
    expect(book).toContain('var pages: Long? = null')
    expect(book).toContain('var counts: List<Long>')
    expect(kotlinClass(r.code, 'Shelf')).toContain('var weight: Double')
  })

  it('an array response (`s.array(book_schema)` decoded as `Book[]`) refines the element struct', () => {
    const src = MODULE('Book[]', 's.array(book_schema)')
    expect(swiftStruct(transform(src, { target: 'swift' }).code, 'Book')).toContain('var price: Double')
    expect(kotlinClass(transform(src, { target: 'kotlin' }).code, 'Book')).toContain('var price: Double')
  })

  it('a struct with NO response-schema evidence keeps the Long default (additive only)', () => {
    const src = SINGLE.replace(", { response: book_schema })", ')')
    const r = transform(src, { target: 'kotlin' })
    expect(kotlinClass(r.code, 'Book')).toContain('var price: Long')
  })
})

// ─── Execution: decode a fractional payload into the emitted type ───────────

const PAYLOAD = JSON.stringify({
  id: 'b1',
  rating: 4.5,
  price: 12.99,
  scores: [1.5, 2],
  counts: [3, 4],
  pages: 312,
  shelf: { label: 'top', weight: 0.25 },
})
const EXPECTED = 'b1 4.5 12.99 [1.5, 2.0] [3, 4] 312 0.25'

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'pyreon-num-decode-'))
}

describe('a fractional payload decodes on both runtimes', () => {
  it.skipIf(!isSwiftcAvailable())('Swift JSONDecoder decodes it into the emitted Book', () => {
    const code = transform(SINGLE, { target: 'swift' }).code
    const dir = scratch()
    try {
      const main = join(dir, 'main.swift')
      writeFileSync(
        main,
        `import Foundation
${swiftStruct(code, 'Shelf')}
${swiftStruct(code, 'Book')}
let data = ${JSON.stringify(PAYLOAD)}.data(using: .utf8)!
let b = try! JSONDecoder().decode(Book.self, from: data)
print("\\(b.id) \\(b.rating!) \\(b.price) \\(b.scores) \\(b.counts) \\(b.pages!) \\(b.shelf!.weight)")
`,
      )
      execFileSync('swiftc', ['-o', join(dir, 'main'), main], { stdio: 'pipe' })
      const out = execFileSync(join(dir, 'main'), { encoding: 'utf8' }).trim()
      expect(out).toBe(EXPECTED)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 240_000)

  const kotlinx = findKotlinxJars()
  const java = jvmPath()
  it.skipIf(!isKotlincAvailable() || kotlinx === null || java === undefined)(
    'kotlinx Json decodes it into the emitted Book',
    () => {
      const code = transform(SINGLE, { target: 'kotlin' }).code
      const dir = scratch()
      try {
        const main = join(dir, 'Main.kt')
        writeFileSync(
          main,
          `import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
${kotlinClass(code, 'Shelf')}
${kotlinClass(code, 'Book')}
fun main() {
  val b = Json.decodeFromString(Book.serializer(), ${JSON.stringify(PAYLOAD).replace(/\$/g, '\\$')})
  println("\${b.id} \${b.rating} \${b.price} \${b.scores} \${b.counts} \${b.pages} \${b.shelf!!.weight}")
}
`,
        )
        const cp = [kotlinx!.core, kotlinx!.json].join(':')
        execFileSync(
          'kotlinc',
          [main, `-Xplugin=${kotlinx!.plugin}`, '-cp', cp, '-include-runtime', '-d', join(dir, 'main.jar')],
          { stdio: 'pipe' },
        )
        const out = execFileSync(java!, ['-cp', `${join(dir, 'main.jar')}:${cp}`, 'MainKt'], {
          encoding: 'utf8',
        }).trim()
        expect(out).toBe(EXPECTED)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    300_000,
  )

  // A skip must not masquerade as coverage: say which half did not run.
  it('reports which runtime halves ran', () => {
    const missing: string[] = []
    if (!isSwiftcAvailable()) missing.push('swiftc')
    if (!isKotlincAvailable()) missing.push('kotlinc')
    if (kotlinx === null) missing.push('kotlinx-serialization jars (gradle cache) + compiler plugin')
    if (java === undefined) missing.push('a JVM')
    if (missing.length > 0) console.warn(`[native-response-schema-number] execution skipped for: ${missing.join(', ')}`)
    expect(true).toBe(true)
  })
})

/**
 * kotlinx-serialization for the execution spec: the JVM runtime jars from a
 * local Gradle cache (an Android build populates it) and the compiler plugin
 * that ships with kotlinc. `null` when either is absent, which SKIPS the spec
 * loudly (see above) rather than passing it.
 */
function findKotlinxJars(): { core: string; json: string; plugin: string } | null {
  const base = join(homedir(), '.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlinx')
  const newest = (artifact: string): string | null => {
    const dir = join(base, artifact)
    if (!existsSync(dir)) return null
    const versions = readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    for (const v of versions.reverse()) {
      for (const hash of readdirSync(join(dir, v))) {
        const jar = join(dir, v, hash, `${artifact}-${v}.jar`)
        if (existsSync(jar)) return jar
      }
    }
    return null
  }
  const core = newest('kotlinx-serialization-core-jvm')
  const json = newest('kotlinx-serialization-json-jvm')
  let plugin: string | null = null
  try {
    const kotlinc = execFileSync('which', ['kotlinc'], { encoding: 'utf8' }).trim()
    const real = execFileSync('realpath', [kotlinc], { encoding: 'utf8' }).trim()
    // A plain distribution (`<home>/bin/kotlinc`) or a Homebrew wrapper
    // (`<cellar>/bin/kotlinc` exec'ing `<cellar>/libexec/bin/kotlinc`).
    plugin =
      ['../../lib', '../../libexec/lib']
        .map((rel) => join(real, rel, 'kotlinx-serialization-compiler-plugin.jar'))
        .find((candidate) => existsSync(candidate)) ?? null
  } catch {
    plugin = null
  }
  return core && json && plugin ? { core, json, plugin } : null
}

/**
 * `kotlinc` ships its own JVM but running the jar needs one, and on a
 * developer Mac the JDK is often off PATH under Homebrew (`/usr/bin/java` is
 * then a stub that fails). Same lookup as `native-url-encoder-parity.test.ts`.
 */
function jvmPath(): string | undefined {
  for (const c of ['java', '/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java']) {
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' })
      return c
    } catch {
      // try the next location
    }
  }
  return undefined
}
