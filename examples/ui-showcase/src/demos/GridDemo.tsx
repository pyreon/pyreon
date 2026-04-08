import { Col, Container, Row } from '@pyreon/coolgrid'
import { Title, Paragraph } from '@pyreon/ui-components'

const cellStyle =
  'padding: 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; text-align: center; font-size: 14px;'

export function GridDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Responsive Grid</Title>
      <Paragraph style="margin-bottom: 24px">
        12-column responsive grid from `@pyreon/coolgrid`. Use breakpoint arrays for responsive sizing.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">Equal columns</Title>
      <Container style="margin-bottom: 24px;">
        <Row>
          <Col size={4}><div style={cellStyle}>Col 4</div></Col>
          <Col size={4}><div style={cellStyle}>Col 4</div></Col>
          <Col size={4}><div style={cellStyle}>Col 4</div></Col>
        </Row>
      </Container>

      <Title size="h3" style="margin-bottom: 12px">Mixed widths</Title>
      <Container style="margin-bottom: 24px;">
        <Row>
          <Col size={6}><div style={cellStyle}>Col 6</div></Col>
          <Col size={3}><div style={cellStyle}>Col 3</div></Col>
          <Col size={3}><div style={cellStyle}>Col 3</div></Col>
        </Row>
      </Container>

      <Title size="h3" style="margin-bottom: 12px">Responsive — [xs, sm, md, lg]</Title>
      <Paragraph style="margin-bottom: 12px; font-size: 13px; color: #6b7280;">
        Resize the window to see columns adjust at each breakpoint.
      </Paragraph>
      <Container style="margin-bottom: 24px;">
        <Row>
          <Col size={[12, 6, 4, 3]}><div style={cellStyle}>12/6/4/3</div></Col>
          <Col size={[12, 6, 4, 3]}><div style={cellStyle}>12/6/4/3</div></Col>
          <Col size={[12, 6, 4, 3]}><div style={cellStyle}>12/6/4/3</div></Col>
          <Col size={[12, 6, 4, 3]}><div style={cellStyle}>12/6/4/3</div></Col>
        </Row>
      </Container>

      <Title size="h3" style="margin-bottom: 12px">4-column dashboard layout</Title>
      <Container style="margin-bottom: 24px;">
        <Row>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Col size={[12, 6, 3]}>
              <div style={cellStyle}>Card {n}</div>
            </Col>
          ))}
        </Row>
      </Container>
    </div>
  )
}
