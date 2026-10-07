import { Element, Text } from '@pyreon/elements'

export function Aligns() {
  return (
    <Element direction="rows" gap="md">
      <Element direction="rows" alignX="left"><Text>l</Text></Element>
      <Element direction="rows" alignX="right"><Text>r</Text></Element>
      <Element direction="rows" alignX="center"><Text>c</Text></Element>
      <Element direction="rows" alignX="top"><Text>t</Text></Element>
      <Element direction="rows" alignX="bottom"><Text>b</Text></Element>
      <Element direction="rows" alignX="block"><Text>unmapped</Text></Element>
      <Element direction="cols" alignY="top"><Text>t</Text></Element>
      <Element direction="cols" alignY="bottom"><Text>b</Text></Element>
      <Element direction="cols" alignY="center"><Text>c</Text></Element>
      <Element direction="cols" alignY="left"><Text>l</Text></Element>
      <Element direction="cols" alignY="right"><Text>r</Text></Element>
      <Element direction="cols" alignY="block"><Text>unmapped</Text></Element>
      <Element alignX="center"><Text>no direction</Text></Element>
      <Element alignY="center"><Text>no direction, y</Text></Element>
    </Element>
  )
}
