import { computed, signal } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
type O = { email: string }
type P = { name: string; age: number; ok: boolean; tags: string[]; owner: O }
const Pet = s.object({
  name: s.string().min(2),
  age: s.number(),
  ok: s.boolean(),
  tags: s.array(s.string()),
  owner: s.object({ email: s.string().email() }),
})
export function App() {
  const pet = signal<P>({ name: 'Rex', age: 3, ok: true, tags: ['a'], owner: { email: 'a@b.co' } })
  const owner = signal<O>({ email: 'b@c.io' })
  const whole = computed(() => Pet.safeParse(pet()).success)
  const nested = computed(() => Pet.safeParse({ name: 'Mo', age: 1, ok: false, tags: [], owner: owner() }).success)
  return <Text>{whole() && nested() ? 'valid' : 'invalid'}</Text>
}
