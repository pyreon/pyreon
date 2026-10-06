import { Element, Text } from '@pyreon/elements'

export function Directions(props: { dir: string; gap: string }) {
  return (
    <Element>
      <Element direction="columns" alignY="bottom"><Text>columns</Text></Element>
      <Element direction="inline" alignY="center"><Text>inline</Text></Element>
      <Element direction="reverseInline" alignY="top"><Text>reverseInline</Text></Element>
      <Element direction="row" alignY="bottom"><Text>row</Text></Element>
      <Element direction="inverseRows" alignX="right"><Text>inverseRows</Text></Element>
      <Element direction={props.dir} gap={props.gap} data-testid="dyn"><Text>dynamic</Text></Element>
      <Element direction="rows" gap="sm" style={{ padding: 4 }} data-testid="styled"><Text>styled</Text></Element>
    </Element>
  )
}
