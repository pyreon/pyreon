import { Container, Row, Col } from '@pyreon/coolgrid'
import { Element, Text } from '@pyreon/elements'

export const theme = defineTheme({ color: { surface: '#ffffff' }, spacing: { md: 16 } })
const Card = rocketstyle()({ name: 'Card', component: Element }).theme(() => ({
  padding: t.spacing.md,
  backgroundColor: t.color.surface,
}))

export function Grid(props: { span: number }) {
  return (
    <Container gap={16}>
      <Row gap={8}>
        <Col size={3} data-testid="narrow"><Text>3</Text></Col>
        <Col size={9}><Text>9</Text></Col>
      </Row>
      <Row gap={10}>
        <Col><Text>equal</Text></Col>
        <Col size={{ xs: 12, md: 6 }}><Text>responsive</Text></Col>
        <Col size={props.span}><Text>dynamic</Text></Col>
      </Row>
      <Element direction="rows" alignX="center" gap="md">
        <Card><Text>card</Text></Card>
      </Element>
      <Element direction="inline" alignY="bottom">
        <Text>row element</Text>
      </Element>
    </Container>
  )
}
