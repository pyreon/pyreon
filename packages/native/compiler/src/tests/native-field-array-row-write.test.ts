// A `useFieldArray` row written from inside its own row — `item.value.set(t)`
// from a `<Field>` in the row, `item.value.update(fn)` from a button — is what a
// form of dynamic inputs does (FRM-1). The native row is a value type (Swift
// struct, Kotlin data class with a `val`), so the generic signal-write lowering
// (`item.value = t`) compiled on neither target, with no warning. The form
// plugin now routes it through the array by the row's KEY:
// `rows.setValue(key: item.key, t)` / `rows.setValue(item.key, t)`.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SRC = `import { useFieldArray } from '@pyreon/form'
import { Button, Field, For, Stack, Text } from '@pyreon/primitives'
export function Rows() {
  const rows = useFieldArray(['alpha', 'beta'])
  return (
    <Stack>
      <Text>Values: {rows.values().join(',')}</Text>
      <For each={rows.items()} by={(i) => i.key}>
        {(item) => (
          <Stack>
            <Field value={item.value} onChangeText={(t) => item.value.set(t)} />
            <Button onPress={() => item.value.update((v) => v + '!')}>Shout</Button>
          </Stack>
        )}
      </For>
    </Stack>
  )
}`

describe('useFieldArray row writes from inside the row', () => {
  it('Swift: set and update go through the array by key', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('set: { t in rows.setValue(key: item.key, t) }')
    expect(out.code).toContain('rows.setValue(key: item.key, ({ v in v + "!" })(item.value))')
    expect(out.code).not.toMatch(/item\.value\s*=/)
    expect(out.code).not.toContain('item.value.update')
  })

  it('Kotlin: set and update go through the array by key', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('onValueChange = { t -> rows.setValue(item.key, t) }')
    expect(out.code).toContain('rows.setValue(item.key, item.value.let({ v -> v + "!" }))')
    expect(out.code).not.toMatch(/item\.value\s*=/)
    expect(out.code).not.toContain('item.value.update')
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })
})
