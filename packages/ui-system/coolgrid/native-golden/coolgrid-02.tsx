import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'

export function Spans(props: { n: number }) {
  return (
    <Container>
      <Row>
        <Col size={1}><Text>1</Text></Col>
        <Col size={5} data-testid="five"><Text>5</Text></Col>
        <Col size={12}><Text>12</Text></Col>
        <Col size={13}><Text>13 clamps</Text></Col>
        <Col size={0}><Text>0</Text></Col>
        <Col size={2.5}><Text>2.5</Text></Col>
        <Col size={-1}><Text>-1</Text></Col>
        <Col size={{ xs: 12 }}><Text>object</Text></Col>
        <Col size={[1, 2]}><Text>array</Text></Col>
        <Col size={props.n}><Text>dynamic</Text></Col>
        <Col><Text>equal</Text></Col>
        <Col data-testid="equal"><Text>equal tid</Text></Col>
        <Col size={3} style={{ padding: 2 }}><Text>styled</Text></Col>
      </Row>
    </Container>
  )
}
