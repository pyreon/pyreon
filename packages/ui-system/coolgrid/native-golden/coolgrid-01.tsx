import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'

export function Gaps(props: { gap: number }) {
  return (
    <Container gap={0} columns={12} gutter={16} contentAlignX="center">
      <Row gap={4}><Col><Text>4</Text></Col></Row>
      <Row gap={8}><Col><Text>8</Text></Col></Row>
      <Row gap={12}><Col><Text>12</Text></Col></Row>
      <Row gap={16}><Col><Text>16</Text></Col></Row>
      <Row gap={20}><Col><Text>20</Text></Col></Row>
      <Row gap={24}><Col><Text>24</Text></Col></Row>
      <Row gap={32}><Col><Text>32</Text></Col></Row>
      <Row gap={40}><Col><Text>40</Text></Col></Row>
      <Row gap={48}><Col><Text>48</Text></Col></Row>
      <Row gap={10}><Col><Text>off-scale</Text></Col></Row>
      <Row gap="md"><Col><Text>token</Text></Col></Row>
      <Row gap={props.gap}><Col><Text>dynamic</Text></Col></Row>
      <Row><Col><Text>no gap</Text></Col></Row>
    </Container>
  )
}
