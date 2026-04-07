import { Title, Paragraph } from '@pyreon/ui-components'

export function TitleDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 24px;">Title</h2>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Title size="h1">Heading 1</Title>
        <Title size="h2">Heading 2</Title>
        <Title size="h3">Heading 3</Title>
        <Title size="h4">Heading 4</Title>
        <Title size="h5">Heading 5</Title>
        <Title size="h6">Heading 6</Title>
      </div>

      <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">With Paragraph</h3>
      <div style="margin-bottom: 24px;">
        <Title size="h2">Article Title</Title>
        <Paragraph>Body text following a heading. Uses default font size.</Paragraph>
      </div>
    </div>
  )
}
