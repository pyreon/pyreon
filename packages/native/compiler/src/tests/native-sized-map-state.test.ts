import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
  validateSwiftWithStubs,
} from '../validate'
import { sizedMapStubs } from '../../../../core/sized-map/src/native-plugin/stubs'

const source = `import { SizedMap as Cache } from '@pyreon/sized-map'
import { computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const seen = new Cache<string, number>({ maxEntries: 10, lru: true })
  const summary = computed(() => seen.size + seen.keys().length + seen.values().length + (seen.get('a') ?? 0))
  const write = () => { seen.set('a', (seen.get('a') ?? 0) + 1); seen.delete('b') }
  return <Stack>
    <Text>{summary()}</Text><Text>{seen.has('a') ? 'yes' : 'no'}</Text>
    <Button onPress={write}>write</Button>
    <Button onPress={() => { seen.set('b', 2); seen.clear() }}>clear</Button>
  </Stack>
}`
const swift = () => transform(source, { target: 'swift' })
const kotlin = () => transform(source, { target: 'kotlin' })
const corpusSource = readFileSync(
  new URL('../../../../core/sized-map/native-golden/sized-map-17.tsx', import.meta.url),
  'utf8',
)

describe('component SizedMap state', () => {
  it('Swift keeps one state-owned container and its class methods', () => {
    const result = swift()
    expect(result.warnings).toEqual([])
    expect(result.code).toContain(
      '@State private var seen = PyreonSizedMap<String, Int>(maxEntries: 10, lru: true)',
    )
    expect(result.code.match(/PyreonSizedMap</g)).toHaveLength(1)
    expect(result.code).toContain('seen.size')
    expect(result.code).toContain('seen.get("a")')
    expect(result.code).toContain('seen.set("a",')
    expect(result.code).toContain('seen.delete("b")')
    expect(result.code).toContain('seen.has("a")')
    expect(result.code).toContain('seen.clear()')
    expect(result.code).toContain('seen.keys().count')
    expect(result.code).toContain('seen.values().count')
    expect(result.code).toContain('private var summary: Int')
    expect(result.code).not.toContain('seen.count')
  })

  it('Kotlin remembers the container and keeps its class methods', () => {
    const result = kotlin()
    expect(result.warnings).toEqual([])
    expect(result.code).toContain(
      'val seen = remember { PyreonSizedMap<String, Long>(maxEntries = 10L, lru = true) }',
    )
    expect(result.code.match(/PyreonSizedMap</g)).toHaveLength(1)
    expect(result.code).toContain('seen.get("a")')
    expect(result.code).toContain('seen.set("a",')
    expect(result.code).toContain('seen.delete("b")')
    expect(result.code).toContain('seen.has("a")')
    expect(result.code).not.toContain('seen.containsKey(')
  })

  it.skipIf(!isSwiftcAvailable())(
    'Swift compiles against both the declared stubs and shipped container',
    () => {
      const runtime = readFileSync(
        new URL('../../../../core/sized-map/native/swift/PyreonSizedMap.swift', import.meta.url),
        'utf8',
      )
      for (const input of [source, corpusSource])
        for (const augmentation of [sizedMapStubs, { swift: () => runtime }]) {
          const result = validateSwiftWithStubs(transform(input, { target: 'swift' }).code, {
            augment: [augmentation],
          })
          expect(result.skipped).not.toBe(true)
          expect(result.ok, result.error).toBe(true)
        }
    },
  )

  it.skipIf(!isSwiftUIAvailable())(
    'the shipped container and state declaration typecheck with real SwiftUI',
    () => {
      const runtime = readFileSync(
        new URL('../../../../core/sized-map/native/swift/PyreonSizedMap.swift', import.meta.url),
        'utf8',
      )
      const result = validateSwiftTypecheck(`${runtime}\n${swift().code}`)
      expect(result.skipped).not.toBe(true)
      expect(result.ok, result.error).toBe(true)
    },
  )

  it.skipIf(!isKotlincAvailable())(
    'Kotlin compiles against both the declared stubs and shipped container',
    () => {
      const runtime = readFileSync(
        new URL(
          '../../../../core/sized-map/native/kotlin/com/pyreon/runtime/PyreonSizedMap.kt',
          import.meta.url,
        ),
        'utf8',
      ).replace(/^package .*$/m, '')
      for (const input of [source, corpusSource])
        for (const augmentation of [sizedMapStubs, { kotlin: () => runtime }]) {
          const result = validateKotlin(transform(input, { target: 'kotlin' }).code, {
            augment: [augmentation],
          })
          expect(result.skipped).not.toBe(true)
          expect(result.ok, result.error).toBe(true)
        }
    },
  )
})
