import { signal } from '@pyreon/reactivity'
import { rx } from '@pyreon/rx'
import { Text } from '@pyreon/primitives'

// Missing and extra arguments, a source that is not a typed array, and callees that are not `rx.<name>` at all.
export function Shapes(props: { source: number[] }) {
  const nums = signal([1, 2, 3])
  const untyped = signal(null)
  const noPredicate = rx.filter(nums)
  const noCount = rx.take(nums)
  const noSkip = rx.skip(nums)
  const firstOfUnknown = rx.first(untyped)
  const sumOfProp = rx.sum(props.source)
  const noSource = rx.count()
  const computedMember = rx['filter'](nums, (x) => x > 1)
  const deepMember = props.source.length.toString()
  const viaTernary = (props.source ? rx.filter : rx.map)(nums, (x) => x)
  return <Text>{String(noPredicate() + noCount() + noSkip() + firstOfUnknown() + sumOfProp() + noSource() + computedMember + deepMember + viaTernary)}</Text>
}
