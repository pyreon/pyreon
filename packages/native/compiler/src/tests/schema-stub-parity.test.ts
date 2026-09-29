// The schema types every emitted schema throws / returns live in the RUNTIME
// (`PyreonSchema.swift` / `PyreonSchema.kt`), and the validation stubs carry a
// copy so the Linux gates can resolve them. A copy is only safe if it is
// EXACT: a stub wider than the runtime masks a real break, a narrower one
// rejects correct code. So the stub text must appear verbatim in the runtime.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KOTLIN_COMPOSE_STUBS } from '../kotlin-stubs'
import { SWIFT_UI_STUBS } from '../swift-stubs'

const NATIVE = resolve(import.meta.dirname, '../../..')

/** The declaration block starting at `head`, brace-matched. */
function block(text: string, head: string): string {
  const start = text.indexOf(head)
  expect(start, `\`${head}\` not found`).toBeGreaterThanOrEqual(0)
  const open = text.indexOf('{', start)
  const lineEnd = text.indexOf('\n', start)
  // A declaration with no body (`data class X(...)`) ends at its line.
  if (open === -1 || open > lineEnd) return text.slice(start, lineEnd)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  throw new Error(`unbalanced block for ${head}`)
}

describe('schema stubs are byte-for-byte copies of the runtime', () => {
  const swift = readFileSync(resolve(NATIVE, 'runtime-swift/Sources/PyreonRuntime/PyreonSchema.swift'), 'utf8')
  const kotlin = readFileSync(
    resolve(NATIVE, 'runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonSchema.kt'),
    'utf8',
  )

  it.each(['public enum PyreonSchemaError', 'public struct PyreonParseResult'])('Swift %s', (head) => {
    expect(block(SWIFT_UI_STUBS, head)).toBe(block(swift, head))
  })

  it.each(['sealed class PyreonSchemaError', 'data class PyreonParseResult'])('Kotlin %s', (head) => {
    expect(block(KOTLIN_COMPOSE_STUBS, head)).toBe(block(kotlin, head))
  })

  // The conversion helpers are stubbed as SIGNATURES (their bodies need a real
  // encoder); each stub signature must match a runtime declaration exactly.
  const signatures = (text: string, re: RegExp): string[] =>
    [...text.matchAll(re)].map((m) => m[0].replace(/\s+/g, ' ').trim())

  it('Swift conversion helpers', () => {
    const re = /public func pyreonSchema\w+[^{]*/g
    const stub = signatures(SWIFT_UI_STUBS, re)
    expect(stub.length).toBe(3)
    expect(stub.filter((sig) => !signatures(swift, re).includes(sig))).toEqual([])
  })

  it('Kotlin conversion helpers', () => {
    const re = /(?:inline )?fun (?:<reified T> )?pyreonSchema\w+\([^)]*\): [^=\n{]+/g
    const stub = signatures(KOTLIN_COMPOSE_STUBS, re)
    expect(stub.length).toBe(3)
    expect(stub.filter((sig) => !signatures(kotlin, re).includes(sig))).toEqual([])
  })
})
