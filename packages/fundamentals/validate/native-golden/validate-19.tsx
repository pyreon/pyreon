import { computed } from '@pyreon/reactivity'
import { s } from '@pyreon/validate'
const Owner = s.object({ email: s.string().email() })
export function OwnerBadge() {
  const ok = computed(() => Owner.safeParse({ email: 'a@b.co' }).success)
  return <Text>{ok() ? 'valid owner' : 'invalid owner'}</Text>
}
