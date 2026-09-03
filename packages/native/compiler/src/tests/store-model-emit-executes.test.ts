import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

/**
 * EXECUTE the emitted store/model — every other native check only TYPECHECKS.
 *
 * `validateSwiftWithStubs` / `validateKotlin` run `swiftc -typecheck` and a
 * kotlinc compile. Both answer "does this compile?", and neither answers "does
 * it work?". For `defineStore` and `model` that gap is the whole contract: both
 * lower to a SINGLETON holding mutable state, and an emit that produced a fresh
 * instance per access, or a `let` where a `var` was needed, or a computed
 * `shared` would compile perfectly and lose every write. String-level emit
 * assertions cannot see it either — they pass whenever the string matches what
 * the author expected, which is the thing under test.
 *
 * This is also why `native/tests/` is absent from `@pyreon/store` and
 * `@pyreon/state-tree` while every other co-located package has one: their
 * runtimes are MARKER-ONLY (`PyreonStoreProtocol` / `PyreonModelProtocol` are
 * empty). There is no runtime to test — the behaviour is entirely in the emit,
 * so the emit is what has to run.
 *
 * Honest limit: the Kotlin arm executes against the stub `mutableStateOf`,
 * whose `MutableState` is a real mutable box. That proves the singleton and the
 * read/write round-trip; it does NOT prove Compose recomposition, which no
 * headless run can. The Swift arm uses the real `Observation` macro.
 */

/** Slice a top-level declaration (and any attribute lines above it) out of an
 *  emit, by brace-counting from its declaration line. */
function extractDecl(code: string, declMatch: RegExp, attrPrefixes: string[] = []): string {
  const lines = code.split('\n')
  const start = lines.findIndex((l) => declMatch.test(l))
  if (start < 0) throw new Error(`declaration not found in emit: ${declMatch}`)
  // Walk backwards over attribute lines (@Observable and friends).
  let head = start
  while (head > 0 && attrPrefixes.some((p) => lines[head - 1]!.trim().startsWith(p))) head--
  let depth = 0
  let end = start
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]!) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    if (depth === 0 && i > start) {
      end = i
      break
    }
    if (depth === 0 && lines[i]!.includes('{') && lines[i]!.includes('}')) {
      end = i
      break
    }
  }
  return lines.slice(head, end + 1).join('\n')
}

const STORE_SRC = `
import { Text, Stack } from '@pyreon/primitives'
import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/core'
const useCounter = defineStore('counter', () => {
  const count = signal(0)
  return { count }
})
export function C() {
  return <Stack><Text>{String(useCounter().store.count())}</Text></Stack>
}`

const MODEL_SRC = `
import { Text, Stack } from '@pyreon/primitives'
import { model } from '@pyreon/state-tree'
const settings = model({ state: { pageSize: 20 } }).create()
export function C() {
  return <Stack><Text>{String(settings.pageSize())}</Text></Stack>
}`

/** The REAL shipped runtime, not a re-declaration. The emitted class conforms
 *  to `PyreonStoreProtocol` / `PyreonModelProtocol`, so compiling against the
 *  actual file is what proves the emit and the runtime agree -- a marker
 *  re-declared in the harness would agree with itself. */
function realRuntime(pkg: 'store' | 'state-tree', lang: 'swift' | 'kotlin'): string {
  const file = pkg === 'store' ? 'PyreonStore' : 'PyreonModel'
  const path =
    lang === 'swift'
      ? join(__dirname, `../../../../fundamentals/${pkg}/native/swift/${file}.swift`)
      : join(__dirname, `../../../../fundamentals/${pkg}/native/kotlin/com/pyreon/runtime/${file}.kt`)
  const src = readFileSync(path, 'utf8')
  // Concatenating two files into one compilation unit cannot carry two package
  // declarations, so the Kotlin one is dropped (the harness file is package-less).
  return lang === 'kotlin' ? src.replace(/^package .*$/m, '') : src
}

function runSwift(body: string, decl: string, runtime: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-emit-run-'))
  // Named `main.swift` so top-level statements are legal: the emitted class is
  // `@available(macOS 14.0, *)`, and an `@main` entry point cannot carry that
  // availability without annotating the whole type. An `if #available` block
  // around the body is the honest form -- and it PRINTS on the else branch, so
  // an older host cannot look like a pass.
  const file = join(dir, 'main.swift')
  const bin = join(dir, 'prog')
  writeFileSync(
    file,
    `${runtime}\n\n${decl}\n\nif #available(macOS 14.0, *) {\n${body}\n} else {\n  print("HOST-TOO-OLD")\n}\n`,
  )
  execFileSync('swiftc', [file, '-o', bin], { stdio: 'pipe' })
  return execFileSync(bin, { encoding: 'utf8' }).trim()
}

/** The Compose stubs also declare the two marker interfaces, so concatenating
 *  them with the REAL runtime is a redeclaration. Drop the stub's copies: the
 *  point of this harness is to compile against the shipped file, and a marker
 *  the harness supplies itself would only ever agree with itself. */
function stubsWithoutMarkers(): string {
  return KOTLIN_COMPOSE_STUBS.split('\n')
    .filter((l) => l.trim() !== 'interface PyreonStore' && l.trim() !== 'interface PyreonModelProtocol')
    .join('\n')
}

function runKotlin(body: string, decl: string, runtime: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-emit-run-'))
  const file = join(dir, 'main.kt')
  const jar = join(dir, 'p.jar')
  writeFileSync(file, `${stubsWithoutMarkers()}\n\n${runtime}\n\n${decl}\n\nfun main() {\n${body}\n}\n`)
  execFileSync('kotlinc', [file, '-include-runtime', '-d', jar], { stdio: 'pipe' })
  return execFileSync('java', ['-jar', jar], { encoding: 'utf8' }).trim()
}

const swiftOk = isSwiftcAvailable()
const kotlincOk = isKotlincAvailable()
function javaOk(): boolean {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const kotlinOk = kotlincOk && javaOk()

describe('the EMITTED store actually holds state (not just typechecks)', () => {
  it.runIf(swiftOk)('Swift: singleton identity + write persists', () => {
    const code = transform(STORE_SRC, { target: 'swift' }).code ?? ''
    const decl = extractDecl(code, /^final class PyreonStore_counter\b/, ['@Observable'])
    expect(decl).toContain('static let shared')
    const out = runSwift(
      [
        '    precondition(PyreonStore_counter.shared.count == 0, "initial value lost")',
        '    PyreonStore_counter.shared.count = 5',
        '    precondition(PyreonStore_counter.shared.count == 5, "write did not persist")',
        // The load-bearing one: a `shared` that minted a new instance per access
        // would satisfy every assertion above and lose every write in a real app.
        '    precondition(PyreonStore_counter.shared === PyreonStore_counter.shared, "shared is not a singleton")',
        '    print("OK")',
      ].join('\n'),
      decl,
      realRuntime('store', 'swift'),
    )
    expect(out).toBe('OK')
  })

  it.runIf(kotlinOk)('Kotlin: singleton object + write persists', () => {
    const code = transform(STORE_SRC, { target: 'kotlin' }).code ?? ''
    const decl = extractDecl(code, /^object PyreonStore_counter\b/)
    const out = runKotlin(
      [
        '  check(PyreonStore_counter.count == 0) { "initial value lost" }',
        '  PyreonStore_counter.count = 5',
        '  check(PyreonStore_counter.count == 5) { "write did not persist" }',
        '  println("OK")',
      ].join('\n'),
      decl,
      realRuntime('store', 'kotlin'),
    )
    expect(out).toBe('OK')
  })
})

describe('the EMITTED model actually holds state (not just typechecks)', () => {
  it.runIf(swiftOk)('Swift: model state round-trips', () => {
    const code = transform(MODEL_SRC, { target: 'swift' }).code ?? ''
    const decl = extractDecl(code, /^final class PyreonModel_settings\b/, ['@Observable'])
    const out = runSwift(
      [
        '    precondition(PyreonModel_settings.shared.pageSize == 20, "declared default lost")',
        '    PyreonModel_settings.shared.pageSize = 50',
        '    precondition(PyreonModel_settings.shared.pageSize == 50, "write did not persist")',
        '    print("OK")',
      ].join('\n'),
      decl,
      realRuntime('state-tree', 'swift'),
    )
    expect(out).toBe('OK')
  })

  it.runIf(kotlinOk)('Kotlin: model state round-trips', () => {
    const code = transform(MODEL_SRC, { target: 'kotlin' }).code ?? ''
    const decl = extractDecl(code, /^object PyreonModel_settings\b/)
    const out = runKotlin(
      [
        '  check(PyreonModel_settings.pageSize == 20) { "declared default lost" }',
        '  PyreonModel_settings.pageSize = 50',
        '  check(PyreonModel_settings.pageSize == 50) { "write did not persist" }',
        '  println("OK")',
      ].join('\n'),
      decl,
      realRuntime('state-tree', 'kotlin'),
    )
    expect(out).toBe('OK')
  })

  // A skipped suite must never masquerade as coverage: say so out loud.
  it('reports which toolchains were available, so a skip is visible', () => {
    // eslint-disable-next-line no-console
    console.log(`[store-model-emit-executes] swiftc=${swiftOk} kotlinc=${kotlincOk} java=${javaOk()}`)
    expect(swiftOk || kotlinOk).toBe(true)
  })
})
