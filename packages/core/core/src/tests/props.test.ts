import { createUniqueId, mergeProps, splitProps } from '../props'

describe('splitProps', () => {
  test('splits known keys from rest', () => {
    const props = { label: 'Hi', icon: 'star', class: 'btn', id: 'x' }
    const [own, html] = splitProps(props, ['label', 'icon'])
    expect(own).toEqual({ label: 'Hi', icon: 'star' })
    expect(html).toEqual({ class: 'btn', id: 'x' })
  })

  test('preserves getters', () => {
    let count = 0
    const props = Object.defineProperty({} as Record<string, unknown>, 'value', {
      get: () => ++count,
      enumerable: true,
      configurable: true,
    })
    const [own] = splitProps(props, ['value'])
    expect(own.value).toBe(1)
    expect(own.value).toBe(2) // getter called again
  })

  test('handles empty keys array', () => {
    const props = { a: 1, b: 2 }
    const [own, rest] = splitProps(props, [])
    expect(own).toEqual({})
    expect(rest).toEqual({ a: 1, b: 2 })
  })
})

describe('mergeProps', () => {
  test('later sources override earlier', () => {
    const result = mergeProps({ a: 1, b: 2 }, { b: 3, c: 4 })
    expect(result).toEqual({ a: 1, b: 3, c: 4 })
  })

  test("undefined values don't override defined", () => {
    const result = mergeProps({ size: 'md' }, { size: undefined as string | undefined })
    expect(result.size).toBe('md')
  })

  test('preserves getters from sources', () => {
    let count = 0
    const source = Object.defineProperty({} as Record<string, unknown>, 'val', {
      get: () => ++count,
      enumerable: true,
      configurable: true,
    })
    const result = mergeProps({ val: 0 }, source)
    expect(result.val).toBe(1)
    expect(result.val).toBe(2)
  })

  test('getter returning undefined falls back to previous value', () => {
    let override: string | undefined
    const source = Object.defineProperty({} as Record<string, unknown>, 'size', {
      get: () => override,
      enumerable: true,
      configurable: true,
    })
    const result = mergeProps({ size: 'md' }, source)
    expect(result.size).toBe('md') // getter returns undefined, fallback

    override = 'lg'
    expect(result.size).toBe('lg') // getter returns value
  })
})

describe('mergeProps — edge cases', () => {
  test('mixed getter/static value merging across 3+ sources', () => {
    let dynamicSize = 'sm'
    const source1 = { size: 'md', variant: 'primary' }
    const source2 = Object.defineProperty({} as Record<string, unknown>, 'size', {
      get: () => dynamicSize,
      enumerable: true,
      configurable: true,
    })
    const source3 = { color: 'red' }
    const result = mergeProps(source1, source2, source3)
    expect(result.size).toBe('sm')
    dynamicSize = 'xl'
    expect(result.size).toBe('xl')
    expect((result as Record<string, unknown>).variant).toBe('primary')
    expect((result as Record<string, unknown>).color).toBe('red')
  })

  test('getter returning undefined falling through multiple levels of defaults', () => {
    let level2: string | undefined
    let level1: string | undefined
    const defaults = { theme: 'light' }
    const mid = Object.defineProperty({} as Record<string, unknown>, 'theme', {
      get: () => level1,
      enumerable: true,
      configurable: true,
    })
    const top = Object.defineProperty({} as Record<string, unknown>, 'theme', {
      get: () => level2,
      enumerable: true,
      configurable: true,
    })
    const result = mergeProps(defaults, mid, top)
    // Both getters return undefined — falls back to "light"
    expect(result.theme).toBe('light')
    // Mid-level getter returns value — top still undefined, falls to mid
    level1 = 'dark'
    expect(result.theme).toBe('dark')
    // Top-level getter returns value — wins
    level2 = 'system'
    expect(result.theme).toBe('system')
  })

  test('mergeProps with no sources (empty call)', () => {
    const result = mergeProps()
    expect(result).toEqual({})
  })

  test('later source static value overriding earlier getter', () => {
    const dynamic = 'from-getter'
    const getterSource = Object.defineProperty({} as Record<string, unknown>, 'val', {
      get: () => dynamic,
      enumerable: true,
      configurable: true,
    })
    const staticSource = { val: 'static-wins' }
    const result = mergeProps(getterSource, staticSource)
    // Static value should override getter
    expect(result.val).toBe('static-wins')
  })

  test('later source static undefined does not override earlier getter', () => {
    let dynamic = 'from-getter'
    const getterSource = Object.defineProperty({} as Record<string, unknown>, 'val', {
      get: () => dynamic,
      enumerable: true,
      configurable: true,
    })
    const staticSource = { val: undefined }
    const result = mergeProps(getterSource, staticSource)
    // Static undefined — getter should still be used
    expect(result.val).toBe('from-getter')
    dynamic = 'updated'
    expect(result.val).toBe('updated')
  })
})

describe('splitProps — getter reactivity', () => {
  test('preserves getter reactivity through multiple reads', () => {
    let count = 0
    const props = Object.defineProperty({ other: 'x' } as Record<string, unknown>, 'value', {
      get: () => ++count,
      enumerable: true,
      configurable: true,
    })
    const [own, rest] = splitProps(props, ['value'])
    expect(own.value).toBe(1)
    expect(own.value).toBe(2)
    expect(own.value).toBe(3)
    // rest should not include the getter key
    expect(rest).toEqual({ other: 'x' })
  })
})

describe('createUniqueId', () => {
  test('returns incrementing IDs', () => {
    const id1 = createUniqueId()
    const id2 = createUniqueId()
    expect(id1).toMatch(/^pyreon-\d+$/)
    expect(id2).toMatch(/^pyreon-\d+$/)
    expect(id1).not.toBe(id2)
  })
})
