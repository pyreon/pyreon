import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'

const dynamicKey = 'a' + 'b'

export function Rejected(props: { key: string; def: number }) {
  const a = useUrlState(props.key, 'x')
  const b = useUrlState('b', props.def)
  const c = useUrlState('c', [1, 2])
  const d = useUrlState('d', { a: 1 })
  // oxlint-disable-next-line no-loss-of-precision -- the overflowing literal IS the shape under test
  const e = useUrlState('e', 1e999)
  const f = useUrlState('f', Infinity)
  const g = useUrlState('g', NaN)
  const h = useUrlState('h', -Infinity)
  const i = useUrlState('i', -props.def)
  const j = useUrlState('j', null)
  const k = useUrlState(dynamicKey, 'v')
  const l = useUrlState('l', `tpl`)
  const m = useUrlState('m', 10n)
  return <Stack><Text>{a()}{b()}{c()}{d()}{e()}{f()}{g()}{h()}{i()}{j()}{k()}{l()}{m()}</Text></Stack>
}
