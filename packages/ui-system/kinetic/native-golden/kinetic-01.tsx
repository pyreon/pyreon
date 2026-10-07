import { kinetic } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'

const Fade = kinetic('div').preset('fade')
const Rise = kinetic('div').preset('slide-up').duration(200)
const Plain = kinetic('div')
const Odd = kinetic('div').preset('bounce')
const Deep = kinetic('section').duration(300).preset('scale-in').easing('ease-out')

export function Mixed() {
  return (
    <Stack>
      <Fade><Text>fade</Text></Fade>
      <Rise><Text>rise</Text></Rise>
      <Plain><Text>plain</Text></Plain>
      <Odd><Text>odd</Text></Odd>
      <Deep><Fade><Text>nested</Text></Fade></Deep>
    </Stack>
  )
}

export function OnlyPlain() {
  return <Plain><Text>no animation in this component</Text></Plain>
}

export function NoBox() {
  return <Stack><Text>no box</Text></Stack>
}
