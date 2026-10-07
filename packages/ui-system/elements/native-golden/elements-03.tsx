import { Element, Text } from '@pyreon/elements'

export function Slots() {
  return (
    <Element
      direction="cols"
      beforeContent={<Text>before</Text>}
      afterContent={<Text>after</Text>}
      label={<Text>label</Text>}
    >
      <Text>body</Text>
    </Element>
  )
}
