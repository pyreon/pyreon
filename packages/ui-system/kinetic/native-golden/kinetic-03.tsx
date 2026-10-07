import { kinetic as k } from '@pyreon/kinetic'
import { kinetic } from './mine'
import { Stack, Text } from '@pyreon/primitives'

// The component sits ABOVE the factory it uses: the pre-pass, not source order, decides.
export function Early() {
  return <Late><Text>early</Text></Late>
}

const Late = k('div').preset('fade')
export const Exported = k('div').preset('slide-down')
const First = k('div').preset('fade'), Second = 5
const Foreign = kinetic('div').preset('fade')

export function First2() {
  return <Stack><Late><Text>one</Text></Late><Exported><Text>two</Text></Exported></Stack>
}

export function Second2() {
  return <Stack><Late><Text>again</Text></Late></Stack>
}

export function UserOwned() {
  return <Foreign><Text>user kinetic</Text></Foreign>
}

function helper() {
  return <Late><Text>from a helper function</Text></Late>
}

export function AfterHelper() {
  return <Stack><Text>component after the helper</Text></Stack>
}
