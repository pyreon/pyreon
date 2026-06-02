// Compile-validation gate for the Swift emitter.
//
// Snapshot tests in swift.test.ts prove the emit equals what it
// equalled last time. This test proves the emit is syntactically
// valid Swift by piping it through `swiftc -parse`.
//
// Auto-enabled when `swiftc` is on PATH (typical macOS dev machine).
// Set `PYREON_SKIP_NATIVE_VALIDATE=1` to force-skip. Set
// `PYREON_REQUIRE_NATIVE_VALIDATE=1` to fail (instead of skip) if
// the tool is absent — used in the CI job that runs in the
// `swift:latest` Docker image.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwift } from '../validate'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(HERE, '..', 'fixtures')

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8')
}

function emit(name: string): string {
  const result = transform(loadFixture(name), { target: 'swift' })
  return result.code
}

const skipCondition =
  process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
  (!isSwiftcAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')

describe.skipIf(skipCondition)('Swift emit — swiftc -parse validates each fixture', () => {
  // Phase B5 (native readiness audit 2026-06): added 11-canonical-layout
  // to exercise the broader canonical-primitive set (Stack/Inline/Heading)
  // — pre-B5 the loop only covered Text/Button/Show/For. Scout-1 finding.
  const fixtures = [
    '01-stateless.tsx',
    '02-signal.tsx',
    '03-computed.tsx',
    '04-event.tsx',
    '05-multi-signal.tsx',
    '06-for.tsx',
    '07-show.tsx',
    '08-string-computed.tsx',
    '09-props.tsx',
    '10-multi-component.tsx',
    '11-canonical-layout.tsx',
  ] as const

  for (const fixture of fixtures) {
    it(`${fixture} — emitted Swift parses cleanly`, () => {
      const swift = emit(fixture)
      const result = validateSwift(swift)
      if (!result.ok) {
        throw new Error(
          `swiftc -parse rejected emitted output for ${fixture}:\n${result.error}\n\n` +
            `--- emitted source ---\n${swift}\n--- end ---`,
        )
      }
      expect(result.ok).toBe(true)
    })
  }
})

describe('validate.ts module surface', () => {
  it('isSwiftcAvailable returns a boolean', () => {
    expect(typeof isSwiftcAvailable()).toBe('boolean')
  })

  it('validateSwift respects PYREON_SKIP_NATIVE_VALIDATE', () => {
    const prev = process.env.PYREON_SKIP_NATIVE_VALIDATE
    process.env.PYREON_SKIP_NATIVE_VALIDATE = '1'
    try {
      const result = validateSwift('this is not swift at all : ;')
      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(true)
      expect(result.skipReason).toBe('PYREON_SKIP_NATIVE_VALIDATE=1')
    } finally {
      if (prev === undefined) delete process.env.PYREON_SKIP_NATIVE_VALIDATE
      else process.env.PYREON_SKIP_NATIVE_VALIDATE = prev
    }
  })

  it.skipIf(!isSwiftcAvailable())(
    'validateSwift catches a genuinely-broken Swift snippet',
    () => {
      const result = validateSwift('this is { not swift at all : ;')
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toMatch(/error:/i)
    },
  )
})
