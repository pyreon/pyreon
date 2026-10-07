import { kinetic } from '@pyreon/kinetic'
import { fade, fadeUp, fadeDown, fadeLeft, fadeRight, slideUp, slideDown, slideLeft, slideRight, scaleIn, scale, bounceIn, fadeDownLeft, slideUpBig, fadeUp as up } from '@pyreon/kinetic-presets'
import { Stack, Text } from '@pyreon/primitives'

const A = kinetic('div').preset(fade)
const B = kinetic('div').preset(fadeUp)
const C = kinetic('div').preset(fadeDown)
const D = kinetic('div').preset(fadeLeft)
const E = kinetic('div').preset(fadeRight)
const F = kinetic('div').preset(slideUp)
const G = kinetic('div').preset(slideDown)
const H = kinetic('div').preset(slideLeft)
const I = kinetic('div').preset(slideRight)
const J = kinetic('div').preset(scaleIn)
const K = kinetic('div').preset(scale)
const L = kinetic('div').preset(bounceIn)
const M = kinetic('div').preset(fadeDownLeft)
const N = kinetic('div').preset(slideUpBig)
const O = kinetic('div').preset(up)
const local = 'fade'
const P = kinetic('div').preset(local)

export function Pack() {
  return (
    <Stack>
      <A><Text>a</Text></A>
      <B><Text>b</Text></B>
      <C><Text>c</Text></C>
      <D><Text>d</Text></D>
      <E><Text>e</Text></E>
      <F><Text>f</Text></F>
      <G><Text>g</Text></G>
      <H><Text>h</Text></H>
      <I><Text>i</Text></I>
      <J><Text>j</Text></J>
      <K><Text>k</Text></K>
      <L><Text>l</Text></L>
      <M><Text>m</Text></M>
      <N><Text>n</Text></N>
      <O><Text>o</Text></O>
      <P><Text>p</Text></P>
    </Stack>
  )
}
