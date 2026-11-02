// `Todo.schema.safeParse(x)` — the web validator and the two native schema structs must agree, on the SAME inputs.
//
// `native-feature-schema-safeparse.test.ts` proves the emitted struct COMPILES. It cannot say the struct REJECTS what zod
// rejects: a `.min(3)` lowered as `< 3` instead of `<= 3`, an `.int()` that accepts `1.5`, an `.email()` pattern that is
// laxer than zod's all compile, and each is a device accepting input the web refuses. So this asserts by EXECUTION:
//
//   - the WEB half runs the real zod schema the feature was declared with;
//   - the NATIVE half compiles the struct the COMPILER EMITTED for that same `defineFeature` declaration, beside the SHIPPED
//     `PyreonSchema.{swift,kt}` runtime, and runs `safeParse` on each input;
//   - both produce one verdict per input — `ok`, or `fail:<first failing field>` — and the vectors must be equal.
//
// Inputs are written as typed Swift / Kotlin LITERALS, the way the compiler emits a `safeParse({ … })` argument, so an
// integer is an `Int` / `Long` and a fraction a `Double`. A JSON round-trip would turn every number into an NSNumber and
// hide exactly the int-vs-fraction cases this exists to compare.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform } from './first-party-plugins'

const SWIFT_SCHEMA = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonSchema.swift')
const KOTLIN_SCHEMA = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonSchema.kt')

const DECL = `import { defineFeature } from '@pyreon/feature'
import { z } from 'zod'

export const Todo = defineFeature({
  name: 'todo',
  schema: z.object({
    title: z.string().min(3).max(20),
    email: z.string().email(),
    done: z.boolean(),
    age: z.number().int().min(0).max(150),
    nick: z.string().min(2).optional(),
  }),
})
`

/** The web validator — the same `z.object` as `DECL`, because the declaration is what is under test. */
const webSchema = z.object({
  title: z.string().min(3).max(20),
  email: z.string().email(),
  done: z.boolean(),
  age: z.number().int().min(0).max(150),
  nick: z.string().min(2).optional(),
})

type Input = Record<string, string | number | boolean>

const GOOD: Input = { title: 'abcd', email: 'a@b.co', done: true, age: 30 }

/** Each case changes ONE thing from `GOOD`, so a disagreement names the rule it is about. */
const CASES: { name: string; input: Input }[] = [
  { name: 'valid', input: GOOD },
  { name: 'title at min (3)', input: { ...GOOD, title: 'abc' } },
  { name: 'title below min (2)', input: { ...GOOD, title: 'ab' } },
  { name: 'title at max (20)', input: { ...GOOD, title: 'a'.repeat(20) } },
  { name: 'title above max (21)', input: { ...GOOD, title: 'a'.repeat(21) } },
  { name: 'email valid', input: { ...GOOD, email: 'first.last+tag@sub.example.org' } },
  { name: 'email no at', input: { ...GOOD, email: 'nope' } },
  { name: 'email no domain dot', input: { ...GOOD, email: 'a@b' } },
  { name: 'email empty local', input: { ...GOOD, email: '@b.co' } },
  { name: 'email with space', input: { ...GOOD, email: 'a b@c.co' } },
  { name: 'age at 0', input: { ...GOOD, age: 0 } },
  { name: 'age negative', input: { ...GOOD, age: -1 } },
  { name: 'age at 150', input: { ...GOOD, age: 150 } },
  { name: 'age above 150', input: { ...GOOD, age: 151 } },
  { name: 'age fraction', input: { ...GOOD, age: 1.5 } },
  { name: 'age as string', input: { ...GOOD, age: '30' } },
  { name: 'done as string', input: { ...GOOD, done: 'true' } },
  { name: 'title as number', input: { ...GOOD, title: 7 } },
  { name: 'optional absent', input: GOOD },
  { name: 'optional at min', input: { ...GOOD, nick: 'ab' } },
  { name: 'optional below min', input: { ...GOOD, nick: 'a' } },
]

/** Missing REQUIRED fields (a key removed from `GOOD`). */
const MISSING = ['title', 'email', 'done', 'age'] as const
for (const key of MISSING) {
  const { [key]: _drop, ...rest } = GOOD
  CASES.push({ name: `missing ${key}`, input: rest as Input })
}

/** `ok`, or `fail:<field>` — the field zod reports FIRST. */
function webVerdict(input: Input): string {
  const r = webSchema.safeParse(input)
  if (r.success) return 'ok'
  return `fail:${String(r.error.issues[0]?.path[0] ?? '')}`
}

const swiftLiteral = (v: string | number | boolean): string =>
  typeof v === 'string' ? JSON.stringify(v) : typeof v === 'boolean' ? String(v) : Number.isInteger(v) ? String(v) : `${v}`

const kotlinLiteral = (v: string | number | boolean): string =>
  typeof v === 'string'
    ? JSON.stringify(v).replace(/\$/g, '\\$')
    : typeof v === 'boolean'
      ? String(v)
      : Number.isInteger(v)
        ? `${v}L`
        : `${v}`

/** The struct (and its helpers) the compiler emitted for `DECL`, minus the platform imports the harness replaces. */
function emitted(target: 'swift' | 'kotlin'): string {
  const { code, warnings } = transform(DECL, { target })
  expect(warnings).toEqual([])
  return code
    .split('\n')
    .filter((l) => !/^\s*(import|package)\b/.test(l))
    .join('\n')
}

/**
 * The shipped `PyreonSchema.kt` minus its kotlinx-serialization half. The file also holds `pyreonSchemaInput` /
 * `pyreonSchemaValue` (typed value → plain map, through `Json.encodeToString`), which need kotlinx on the classpath; a
 * schema's own `safeParse` does not. Only those two functions and the two imports go — the error and result types, which
 * are what the emitted struct is checked against, stay VERBATIM.
 */
function kotlinSchemaRuntime(): string {
  const src = readFileSync(KOTLIN_SCHEMA, 'utf8')
  const stripped = src
    .replace(/^import kotlinx\.serialization\.[^\n]*\n/gm, '')
    .replace(/inline fun <reified T> pyreonSchemaInput[\s\S]*?\n}\n/, '')
    .replace(/inline fun <reified T> pyreonSchemaValue[^\n]*\n[^\n]*\n/, '')
  if (/^import kotlinx|Json\.encodeToString/m.test(stripped)) throw new Error('kotlinSchemaRuntime: a kotlinx reference survived the strip')
  if (!stripped.includes('sealed class PyreonSchemaError') || !stripped.includes('data class PyreonParseResult')) {
    throw new Error('kotlinSchemaRuntime: the strip removed the types the parity check needs')
  }
  return stripped
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function jvmPath(): string | undefined {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return 'java'
  } catch {
    // fall through to the off-PATH locations
  }
  for (const c of ['/opt/homebrew/opt/openjdk/bin/java', '/opt/homebrew/opt/openjdk@17/bin/java']) {
    if (existsSync(c)) return c
  }
  return undefined
}

describe('Todo.schema — web ⇄ native verdicts, executed', () => {
  it('the web vector is what this file claims it is (a control for the harness)', () => {
    // Pinned by hand so a broken harness cannot make every vector agree on nothing.
    expect(webVerdict(GOOD)).toBe('ok')
    expect(webVerdict({ ...GOOD, title: 'ab' })).toBe('fail:title')
    expect(webVerdict({ ...GOOD, age: 1.5 })).toBe('fail:age')
    expect(webVerdict({ ...GOOD, email: 'nope' })).toBe('fail:email')
    expect(new Set(CASES.map((c) => webVerdict(c.input))).size).toBeGreaterThan(3)
  })

  // The shipped PyreonSchema.swift reads NSNumber booleans through CoreFoundation (CFGetTypeID), which swift-corelibs on
  // Linux does not have — it is an iOS runtime. So this half runs on the macOS lane only; the Kotlin half runs everywhere.
  it.skipIf(!isSwiftcAvailable() || process.platform !== 'darwin')(
    'the SHIPPED Swift runtime, driven by the EMITTED struct, agrees with zod',
    () => {
      const got = withTempDir('pyreon-feature-parity-swift-', (dir) => {
        const calls = CASES.map((c) => {
          const entries = Object.entries(c.input)
            .map(([k, v]) => `${JSON.stringify(k)}: ${swiftLiteral(v)}`)
            .join(', ')
          const dict = entries === '' ? '[String: Any]()' : `[${entries}] as [String: Any]`
          return `out.append(verdict(PyreonZodSchema_Todo_schema.safeParse(${dict})))`
        })
        const harness = `import Foundation
${emitted('swift')}
func verdict(_ r: Result<PyreonZodSchema_Todo_schema, PyreonSchemaError>) -> String {
    switch r {
    case .success: return "ok"
    case .failure(let e):
        switch e {
        case .missingOrWrongType(let field, _): return "fail:" + field
        case .constraintViolation(let field, _): return "fail:" + field
        default: return "fail:?"
        }
    }
}
var out: [String] = []
${calls.join('\n')}
print(out.joined(separator: "\\n"))
`
        writeFileSync(join(dir, 'main.swift'), harness)
        writeFileSync(join(dir, 'PyreonSchema.swift'), readFileSync(SWIFT_SCHEMA, 'utf8'))
        execFileSync('swiftc', [join(dir, 'main.swift'), join(dir, 'PyreonSchema.swift'), '-o', join(dir, 'run')], {
          stdio: 'pipe',
        })
        return execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trimEnd().split('\n')
      })
      expect(got).toEqual(CASES.map((c) => webVerdict(c.input)))
    },
    180_000,
  )

  it.skipIf(!isKotlincAvailable() || jvmPath() === undefined)(
    'the SHIPPED Kotlin runtime, driven by the EMITTED struct, agrees with zod',
    () => {
      const java = jvmPath() as string
      const got = withTempDir('pyreon-feature-parity-kotlin-', (dir) => {
        const calls = CASES.map((c) => {
          const entries = Object.entries(c.input)
            .map(([k, v]) => `${JSON.stringify(k)} to ${kotlinLiteral(v)}`)
            .join(', ')
          return `    out.add(verdict(PyreonZodSchema_Todo_schema.safeParse(mapOf<String, Any?>(${entries}))))`
        })
        const harness = `package com.pyreon.runtime

${emitted('kotlin')}

fun verdict(r: Result<PyreonZodSchema_Todo_schema>): String {
    val e = r.exceptionOrNull() ?: return "ok"
    return when (e) {
        is PyreonSchemaError.MissingOrWrongType -> "fail:" + e.field
        is PyreonSchemaError.ConstraintViolation -> "fail:" + e.field
        else -> "fail:?"
    }
}

fun main() {
    val out = mutableListOf<String>()
${calls.join('\n')}
    println(out.joinToString("\\n"))
}
`
        writeFileSync(join(dir, 'Main.kt'), harness)
        writeFileSync(join(dir, 'PyreonSchema.kt'), kotlinSchemaRuntime())
        execFileSync('kotlinc', [join(dir, 'Main.kt'), join(dir, 'PyreonSchema.kt'), '-include-runtime', '-d', join(dir, 'out.jar')], {
          stdio: 'pipe',
          env: { ...process.env, PATH: `${java.includes('/') ? dirname(java) + delimiter : ''}${process.env.PATH ?? ''}` },
        })
        return execFileSync(java, ['-cp', join(dir, 'out.jar'), 'com.pyreon.runtime.MainKt'], { encoding: 'utf8' })
          .trimEnd()
          .split('\n')
      })
      expect(got).toEqual(CASES.map((c) => webVerdict(c.input)))
    },
    240_000,
  )
})
