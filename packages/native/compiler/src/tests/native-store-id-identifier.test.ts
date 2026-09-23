// A `defineStore` id names the emitted singleton, so it must be an identifier
// on both targets. The ordinary web spelling is kebab-case (`'native-flow-probe'`),
// which emitted `PyreonStore_native-flow-probe` — a hyphenated class name
// swiftc rejects ("expected '{' in class") and kotlinc rejects ("Expecting a
// top level declaration"). Found writing the F3 flow device proof.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const src = `
  import { signal } from '@pyreon/reactivity'
  import { defineStore } from '@pyreon/store'
  import { Button, Text } from '@pyreon/primitives'
  const useProbe = defineStore('native-flow-probe', () => {
    const mounts = signal(0)
    const bump = () => { mounts.set(mounts() + 1) }
    return { mounts, bump }
  })
  export function App() {
    const probe = useProbe()
    return <Button onPress={() => probe.store.bump()}><Text>{probe.store.mounts()}</Text></Button>
  }
`

describe('defineStore id → emitted singleton name', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`[${target}] sanitises a kebab-case id into an identifier`, () => {
      const result = transform(src, { target })
      expect(result.warnings ?? []).toEqual([])
      expect(result.code).toContain('PyreonStore_native_flow_probe')
      expect(result.code).not.toContain('PyreonStore_native-flow-probe')
      const validation = target === 'swift' ? validateSwiftWithStubs(result.code) : validateKotlin(result.code)
      expect(validation.ok, validation.error ?? '').toBe(true)
    })
  }
})
