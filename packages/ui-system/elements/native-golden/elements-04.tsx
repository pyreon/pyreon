import { Element as El, Text } from '@pyreon/elements'
import { Element } from './mine'

export function Guard() {
  return (
    <El direction="rows" alignX="center">
      <Element direction="rows" alignX="center"><Text>user element</Text></Element>
    </El>
  )
}
