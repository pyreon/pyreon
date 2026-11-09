// `useInfiniteQuery<Page>(() => ({ queryKey, queryFn, initialPageParam, getNextPageParam }))` — lowered to
// PyreonInfiniteQuery on both targets (see @pyreon/query/native). The harness wires the next-parameter reader and
// the per-page fetch, then starts the first page; reads are plain fields (Swift) / `.value` (Kotlin).

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `
import { Stack, Text, Button } from '@pyreon/primitives'
import { useInfiniteQuery } from '@pyreon/query'
interface Item { id: number; title: string }
interface Page { items: Item[]; nextCursor: string | undefined }
export function Feed() {
  const feed = useInfiniteQuery<Page>(() => ({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => fetch(\`https://api.example.com/feed?cursor=\${pageParam}\`).then(r => r.json()),
    initialPageParam: '0',
    getNextPageParam: (last) => last.nextCursor,
  }))
  return (
    <Stack>
      <Text>{'Pages: ' + (feed.data()?.pages.length ?? 0)}</Text>
      <Text>{'More: ' + feed.hasNextPage()}</Text>
      <Button onPress={() => feed.fetchNextPage()}>More</Button>
    </Stack>
  )
}
`

const swiftOf = (src: string) => transform(src, { target: 'swift' })
const kotlinOf = (src: string) => transform(src, { target: 'kotlin' })

describe('useInfiniteQuery native lowering', () => {
  it('lowers to a container, wires both closures and starts the first page (Swift)', () => {
    const r = swiftOf(SRC)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonInfiniteQuery<Page>(queryKey: "feed", initialParam: "0")')
    expect(r.code).toContain('getNextParam = { last in pyreonPageParam(last.nextCursor) }')
    expect(r.code).toContain('requestPage = { pageParam in')
    expect(r.code).toContain('feed.start()')
    expect(r.code).toContain('feed.hasNextPage')
    expect(r.code).not.toContain('feed.hasNextPage()')
  })

  it('lowers to a remembered container with MutableState reads (Kotlin)', () => {
    const r = kotlinOf(SRC)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('remember { PyreonInfiniteQuery<Page>(queryKey = "feed", initialParam = "0") }')
    expect(r.code).toContain('feed.hasNextPage.value')
    expect(r.code).toContain('feed.start()')
  })

  it.each([
    ['a fetch init', (s: string) => s.replace(/queryFn:.*\n/, "queryFn: ({ pageParam }) => fetch(`/f?c=${pageParam}`, { method: 'POST' }),\n"), 'init object'],
    ['a missing initialPageParam', (s: string) => s.replace("initialPageParam: '0',\n", ''), 'initialPageParam'],
    ['an unsupported option', (s: string) => s.replace("initialPageParam: '0',", "initialPageParam: '0', staleTime: 10,"), 'staleTime'],
  ])('names the refusal for %s', (_label, mutate, expected) => {
    expect(swiftOf(mutate(SRC)).warnings.join('\n')).toContain(expected)
  })

  it.runIf(isSwiftcAvailable())('the Swift output type-checks against the stubs', () => {
    const v = validateSwiftWithStubs(swiftOf(SRC).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('the Kotlin output compiles against the stubs', () => {
    const v = validateKotlin(kotlinOf(SRC).code)
    expect(v.ok, v.error).toBe(true)
  })
})
