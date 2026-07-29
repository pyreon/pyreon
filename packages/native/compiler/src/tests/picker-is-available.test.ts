// `isAvailable()` was DOCUMENTED on the shared picker surface and implemented
// on exactly one of the three targets.
//
// `UseImagePickerResult` and `UseFilePickerResult` both declare
// `isAvailable: () => boolean`, and their own JSDoc already specifies the
// native behaviour: "Native: always `true` — the runtime's `pick` collapses an
// unavailable picker to `null`." Neither native runtime had the method.
//
// So `if (picker.isAvailable()) { … }` — an ordinary defensive guard, and valid
// TypeScript on web — failed BOTH native targets with ZERO warnings:
//
//   Swift    value of type 'PyreonImagePicker' has no member 'isAvailable'
//   Kotlin   unresolved reference 'isAvailable'
//
// Documented-but-unimplemented, which is the `audit-types` class: the field is
// referenced by the type surface, so nothing flagged it, and the failure only
// appears if someone writes the guard AND builds for native.
//
// Found by sweeping the async platform-API tier — the matrix calls the
// `await hook.method()` lowering "the keystone for the whole async-platform-API
// tier", so it is worth recording that the tier is otherwise healthy: awaiting
// a picker, awaiting biometrics, branching on the result, TWO sequential awaits,
// and an await nested inside an `if` all compile on both targets. This one
// member was the only gap.
//
// Implemented rather than warned, because the documentation already specified
// the answer and it is a true one — these pickers really are always available
// natively. Warning people off a documented method would have been the wrong
// shape.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'
const R = '@pyreon/reactivity'

const guarded = (imp: string, decl: string, recv: string) => `
  import { ${imp} } from '@pyreon/hooks'
  import { signal } from '${R}'
  import { Stack, Text, Button } from '${P}'
  export function C() {
    ${decl}
    const s = signal('idle')
    return (
      <Stack>
        <Text>{s()}</Text>
        <Button onPress={async () => {
          if (${recv}.isAvailable()) { const u = await ${recv}.pick(); s.set(u ?? 'x') }
        }}>go</Button>
      </Stack>
    )
  }
`

describe('picker isAvailable() lowers on both targets', () => {
  const CASES = [
    ['image', guarded('useImagePicker', 'const p = useImagePicker()', 'p')],
    ['file', guarded('useFilePicker', 'const f = useFilePicker()', 'f')],
  ] as const

  for (const [kind, src] of CASES) {
    for (const target of ['swift', 'kotlin'] as const) {
      it(`${target}: ${kind} picker emits the call`, () => {
        const out = transform(src, { target }).code ?? ''
        expect(out).toContain('isAvailable()')
      })
    }

    it(`${kind}: emits no warning — it is a supported member, not a gap`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const w = (transform(src, { target }).warnings ?? []).filter((x) =>
          x.includes('isAvailable'),
        )
        expect(w).toEqual([])
      }
    })
  }
})

// Stub ↔ runtime parity. The gate typechecks against stubs, so a method present
// in the runtime and absent from the stub manufactures a failure on valid
// source, and the reverse masks a real one. Both directions are asserted for
// every target, on both pickers.
describe('isAvailable exists in BOTH the runtimes and the stubs', () => {
  const read = async (rel: string) => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(import.meta.dirname ?? __dirname, '..', '..', '..', rel), 'utf8')
  }

  it('Swift runtimes declare it', async () => {
    for (const f of ['PyreonImagePicker', 'PyreonFilePicker']) {
      const src = await read(`runtime-swift/Sources/PyreonRuntime/${f}.swift`)
      expect(src, `${f}.swift`).toContain('public func isAvailable() -> Bool')
    }
  })

  it('Kotlin runtimes declare it', async () => {
    for (const f of ['PyreonImagePicker', 'PyreonFilePicker']) {
      const src = await read(
        `runtime-kotlin/src/main/kotlin/com/pyreon/runtime/${f}.kt`,
      )
      expect(src, `${f}.kt`).toContain('fun isAvailable(): Boolean')
    }
  })

  it('both stubs mirror them', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const here = import.meta.dirname ?? __dirname
    const swift = readFileSync(resolve(here, '..', 'swift-stubs.ts'), 'utf8')
    const kotlin = readFileSync(resolve(here, '..', 'kotlin-stubs.ts'), 'utf8')
    // Two occurrences each — one per picker. A single match would mean only one
    // of the two was updated, which is exactly how this bug shipped.
    expect((swift.match(/public func isAvailable\(\) -> Bool/g) ?? []).length).toBe(2)
    expect((kotlin.match(/fun isAvailable\(\): Boolean/g) ?? []).length).toBe(2)
  })
})
