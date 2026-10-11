import { computed, signal } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
import { Text } from '@pyreon/primitives'

const useDynamic = defineStore(makeId(), () => {
  const n = signal(0)
  return { n }
})
const useNonFunction = defineStore('non-function', {})
const useConcise = defineStore('concise', () => ({ n: signal(0) }))
const useNoReturn = defineStore('no-return', () => {
  // Intentionally declared without returning it: this fixture exercises the missing-return diagnostic.
  const _n = signal(0)
})
const useNonObject = defineStore('non-object', () => {
  const n = signal(0)
  return n
})
const useLonghand = defineStore('longhand', () => {
  const n = signal(0)
  return { n: n }
})
const useUnknown = defineStore('unknown', () => {
  // The returned key deliberately does not reference this declared signal.
  const _n = signal(0)
  return { missing }
})
const useStatement = defineStore('statement', () => {
  consume()
  const n = signal(0)
  return { n }
})
const useBlockComputed = defineStore('computed', () => {
  const n = signal(0)
  const d = computed(() => {
    return n()
  })
  return { n, d }
})
const useIgnored = defineStore('ignored', () => {
  const { a: _a } = other
  const _unrelated = work()
  const n = signal()
  return { n }
})
const useShort = defineStore('short')
const useA = defineStore('a', () => {
    const n = signal(0)
    return { n }
  }),
  useB = defineStore('b', () => {
    const n = signal(0)
    return { n }
  })

export function StoreDeclines() {
  return <Text>Decline diagnostics</Text>
}

export {
  useDynamic,
  useNonFunction,
  useConcise,
  useNoReturn,
  useNonObject,
  useLonghand,
  useUnknown,
  useStatement,
  useBlockComputed,
  useIgnored,
  useShort,
  useA,
  useB,
}
