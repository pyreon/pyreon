import { Container as Grid, Row as R, Col } from '@pyreon/coolgrid'
import { Row } from './mine'
import { Text } from '@pyreon/elements'

export function Guard() {
  return (
    <Grid>
      <R><Col size={6}><Text>aliased import</Text></Col></R>
      <Row><Col size={6}><Text>user row</Text></Col></Row>
    </Grid>
  )
}
