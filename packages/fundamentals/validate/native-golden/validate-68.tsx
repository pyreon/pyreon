import { s } from '@pyreon/validate'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
const Pet = s.object({ name: s.string(), tags: s.array(s.string()), meta: s.object({ k: s.string() }) })
type Tag = { label: string }
export function V() {
  const tags = signal<Tag[]>([{ label: 'a' }])
  const m = signal(new Map<string, number>())
  const pet = signal({ name: 'x', n: 1 })
  const a = Pet.safeParse({ name: 'a', tags: tags(), meta: { k: 'v' } })
  const b = Pet.safeParse({ name: 'a', tags: [{ label: 'q' }], extra: pet(), arr: [1, { z: 2 }], m: m(), un: tagOrNull })
  const c = Pet.safeParse(pet())
  const d = s.object({ n: s.number() }).safeParse({ n: 1 }).data
  const e = s.object({ n: s.number() }).safeParse({ n: 1 }).success
  return (<Stack><Text>{String(e)}</Text></Stack>)
}
