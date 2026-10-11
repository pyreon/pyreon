import { readFileSync } from 'node:fs'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const source = `import { SizedMap as Cache } from '@pyreon/sized-map'
import { signal as cell } from '@pyreon/reactivity'
import { rx as streams } from '@pyreon/rx'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const ids = cell<number[]>([1, 2, 3, 4])
  const cache = new Cache<string, number>({ maxEntries: 5 })
  const selected = streams.take(streams.reverse(ids), 2)
  return <Stack>
    <Text>{cache.size + selected().length + (cache.get('selected') ?? 0)}</Text>
    <Button onPress={() => cache.set('selected', selected().length)}>Save</Button>
  </Stack>
}`

describe('package frontends share the API 2 parser', () => {
  it('Swift combines imported intrinsics, constructor state, collection expressions and methods', (context) => {
    const output = transform(source, { target: 'swift' })
    expect(output.warnings).toEqual([])
    expect(output.code).toContain('@State private var ids: [Int]')
    expect(output.code).toContain('@State private var cache = PyreonSizedMap<String, Int>')
    expect(output.code).toContain('Array(ids.reversed().prefix(2))')
    expect(output.code).toContain('cache.set("selected", selected.count)')
    if (!isSwiftcAvailable()) {
      context.skip()
      return
    }
    const runtime = readFileSync(
      new URL('../../../../core/sized-map/native/swift/PyreonSizedMap.swift', import.meta.url),
      'utf8',
    )
    const result = validateSwiftWithStubs(output.code, { augment: [{ swift: () => runtime }] })
    expect(result.skipped).not.toBe(true)
    expect(result.ok, result.error).toBe(true)
  })

  it('Kotlin combines imported intrinsics, constructor state, collection expressions and methods', (context) => {
    const output = transform(source, { target: 'kotlin' })
    expect(output.warnings).toEqual([])
    expect(output.code).toContain('var ids by remember { mutableStateOf')
    expect(output.code).toContain('val cache = remember { PyreonSizedMap<String, Long>')
    expect(output.code).toContain('ids.reversed().take(2)')
    expect(output.code).toContain('cache.set("selected", selected.length)')
    if (!isKotlincAvailable()) {
      context.skip()
      return
    }
    const runtime = readFileSync(
      new URL(
        '../../../../core/sized-map/native/kotlin/com/pyreon/runtime/PyreonSizedMap.kt',
        import.meta.url,
      ),
      'utf8',
    ).replace(/^package .*$/m, '')
    const result = validateKotlin(output.code, { augment: [{ kotlin: () => runtime }] })
    expect(result.skipped).not.toBe(true)
    expect(result.ok, result.error).toBe(true)
  })
})
