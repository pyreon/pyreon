// A callback parameter written as a plain object pattern — `({ title, done }) =>` — lowers to member reads.
//
// BEFORE: the parser dropped any destructured parameter and warned, so the body referenced names that were never
// bound. Destructuring a `<For>` item or a `.map` / `.filter` element is the commonest destructure in JSX.
//
// The parameter gets a synthesized name (`__pN`, unique per file) and each local is aliased to a member read on it,
// through the parser's scoped alias map: a nested binding of the same name hides the alias, and a nested
// destructured callback gets its own name, so an outer field still reads the outer parameter.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const APP = [
  "import { Text, Stack, For } from '@pyreon/primitives'",
  "import { signal, computed } from '@pyreon/reactivity'",
  'type T = { id: number; title: string; done: boolean; tags: string[] }',
  'export function App() {',
  '  const ts = signal<T[]>([])',
  '  const open = computed(() => ts().filter(({ done }) => !done).length)',
  '  const names = computed(() => ts().map(({ title: t, id }: T) => t + String(id)))',
  '  const shadow = computed(() => ts().map(({ title, tags }) => tags.map((title) => title.length).length + title.length))',
  '  const block = computed(() => ts().map(({ title }) => { const n = title.length; return n * 2 }))',
  '  const nested = computed(() => ts().map(({ title }) => ts().map(({ id }) => title + String(id)).length))',
  '  return (',
  '    <Stack>',
  '      <Text>{String(open())} {String(names().length)} {String(shadow().length)} {String(block().length)} {String(nested().length)}</Text>',
  "      <For each={ts()} by={(t) => t.id}>{({ title, done }) => <Text>{done ? 'x' : ' '} {title}</Text>}</For>",
  '    </Stack>',
  '  )',
  '}',
].join('\n')

for (const target of ['swift', 'kotlin'] as const) {
  describe(target, () => {
    const out = transform(APP, { target, filename: 'App.tsx' })
    const arrow = target === 'swift' ? ' in ' : ' -> '

    it('lowers each destructured parameter with no warning', () => {
      expect(out.warnings).toEqual([])
      expect(out.code).toMatch(new RegExp(`(__p\\d+)${arrow}!\\1\\.done`))
      // A rename reads the SOURCE field.
      expect(out.code).toMatch(new RegExp(`(__p\\d+)${arrow}\\1\\.title \\+`))
      // An inner `(title) =>` shadows the alias; the outer `title` still reads the parameter.
      expect(out.code).toMatch(/title\.(utf16\.count|length) }\)\.(count|length) \+ __p\d+\.title/)
      // A nested destructured callback gets its own name, and the outer field reads the OUTER parameter.
      const m = out.code.match(new RegExp(`(__p\\d+)${arrow}ts\\.map\\(\\{ (__p\\d+)${arrow}(__p\\d+)\\.title`))
      expect(m).not.toBeNull()
      expect(m![1]).not.toBe(m![2])
      expect(m![3]).toBe(m![1])
    })

    const compile = target === 'swift' ? isSwiftcAvailable() : isKotlincAvailable()
    it.skipIf(!compile)('compiles', () => {
      const r = target === 'swift' ? validateSwiftWithStubs(out.code) : validateKotlin(out.code)
      expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
    }, 180_000)
  })
}
