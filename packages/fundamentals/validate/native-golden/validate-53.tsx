import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Pet = s.object({ name: s.string().min(1), age: s.number() })
export function PetBadge() {
  const ok = computed(() => Pet.safeParse({ name: 'x', age: 3 }).success)
  return <Text>{ok() ? 'valid pet' : 'invalid pet'}</Text>
}
