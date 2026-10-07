import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isObservationAvailable, isSwiftcAvailable } from '../validate'

const IMPORTS = `import { computed, signal } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
import { model } from '@pyreon/state-tree'
import { Button, Stack, Text } from '@pyreon/primitives'
`

const STORE = `${IMPORTS}
const useAccount = defineStore('fractional', () => {
  const balance = signal(0.5)
  const doubled = computed(() => balance() * 2)
  const add = (amount: number = 0.25): number => {
    balance.set(balance() + amount)
    return balance()
  }
  return { balance, doubled, add }
})
export function App() {
  const whole = signal(2)
  return <Stack>
    <Text>{useAccount().store.doubled()}</Text>
    <Button onPress={() => useAccount().store.add()}>Default</Button>
    <Button onPress={() => useAccount().store.add(whole())}>Integer input</Button>
  </Stack>
}`

const MODEL = `${IMPORTS}
const account = model({ state: { balance: 0.5 } })
  .views((owner) => ({ doubled: () => owner.balance() * 2 }))
  .views((owner) => ({ combined: () => owner.doubled() + owner.balance() }))
  .actions((owner) => ({
    add: (amount: number = 0.25): number => {
      owner.balance.set(owner.balance() + amount)
      return owner.balance()
    },
  }))
  .create()
export function App() {
  const whole = signal(2)
  return <Stack>
    <Text>{account.combined()}</Text>
    <Button onPress={() => account.add()}>Default</Button>
    <Button onPress={() => account.add(whole())}>Integer input</Button>
  </Stack>
}`

const HELPER = `${IMPORTS}
function amount(value: number = 0.25): number { return value }
export function App() {
  const whole = signal(2)
  return <Stack><Text>{amount()}</Text><Text>{amount(whole())}</Text></Stack>
}`

const ARRAY_DEFAULT = `${IMPORTS}
function first(values: number[] = [0.25]): number { return values[0] }
export function App() {
  const whole = signal([2])
  return <Stack><Text>{first()}</Text><Text>{first(whole())}</Text></Stack>
}`

const CONSTANT_DEFAULT = `${IMPORTS}
const FRACTION = 0.25
function amount(value: number = FRACTION): number { return value }
export function App() {
  const whole = signal(2)
  return <Stack><Text>{amount()}</Text><Text>{amount(whole())}</Text></Stack>
}`

const INFERRED_DEFAULT = `${IMPORTS}
function amount(value = 0.25) { return value }
export function App() {
  const whole = signal(2)
  return <Stack><Text>{amount()}</Text><Text>{amount(whole())}</Text></Stack>
}`

describe('fractional defaults and singleton member scopes', () => {
  for (const [name, source] of [['store', STORE], ['model', MODEL], ['helper', HELPER], ['array', ARRAY_DEFAULT], ['constant', CONSTANT_DEFAULT], ['inferred', INFERRED_DEFAULT]] as const) {
    it.skipIf(!isSwiftcAvailable() || ((name === 'store' || name === 'model') && !isObservationAvailable()))(`${name} accepts fractional state/defaults and integer callers on Swift`, () => {
      const output = transform(source, { target: 'swift' })
      const result = validateSwiftWithStubs(output.code)
      expect(result.skipped).not.toBe(true)
      expect(result.ok, result.error).toBe(true)
    })

    it.skipIf(!isKotlincAvailable())(`${name} accepts fractional state/defaults and integer callers on Kotlin`, () => {
      const output = transform(source, { target: 'kotlin' })
      const result = validateKotlin(output.code)
      expect(result.skipped).not.toBe(true)
      expect(result.ok, result.error).toBe(true)
    })
  }
})
