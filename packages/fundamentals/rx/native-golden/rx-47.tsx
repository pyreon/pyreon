import { signal } from '@pyreon/reactivity'
import { filter as keep, map, pipe, take, sortBy } from '@pyreon/rx'
import { Text } from '@pyreon/primitives'
import { filter } from './mine'

// The standalone forms resolve through the IMPORT: an aliased name is the export, a same-named import from elsewhere is not.
export function Standalone() {
  const nums = signal([1, 2, 3])
  const a = keep(nums, (x) => x > 1)
  const b = map(nums, (x) => x * 2)
  const c = take(nums, 2)
  const d = filter(nums, (x) => x > 1)
  const e = pipe(nums, take(2))
  const f = sortBy(nums, 'x')
  const g = keep()
  return <Text>{String(a().length + b().length + c().length + d.length + e + f + g)}</Text>
}
