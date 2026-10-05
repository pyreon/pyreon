import { Row, Col, Element } from './mine'
import { Container as Grid } from '@pyreon/coolgrid'
import { Text } from '@pyreon/elements'

function Container(props: { children?: unknown }) {
  return <Text>local</Text>
}

export function UserShadow() {
  return (
    <Row>
      <Col size={4}><Text>user</Text></Col>
      <Element><Text>user element</Text></Element>
      <Container />
      <Grid><Text>renamed import is not claimed</Text></Grid>
    </Row>
  )
}
