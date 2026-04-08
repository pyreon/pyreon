import { Col, Container, Row } from '@pyreon/coolgrid'
import { Title, Paragraph } from '@pyreon/ui-components'

const cellStyle =
  'padding: 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; text-align: center; font-size: 14px;'

const altCellStyle =
  'padding: 12px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; text-align: center; font-size: 13px;'

export function GridDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">Responsive Grid</Title>
      <Paragraph style="margin-bottom: 24px">
        12-column responsive grid from `@pyreon/coolgrid`. Supports breakpoint arrays, row-level sizes, custom column counts, and nesting.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">Equal columns (size on each Col)</Title>
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

      <Title size="h3" style="margin-bottom: 12px">Row-level size — applies to all Cols</Title>
      <Paragraph style="margin-bottom: 12px; font-size: 13px; color: #6b7280;">
        Setting `size` on Row applies to every Col without specifying it individually.
      </Paragraph>
      <Container style="margin-bottom: 24px;">
        <Row size={3}>
          <Col><div style={cellStyle}>Auto 3</div></Col>
          <Col><div style={cellStyle}>Auto 3</div></Col>
          <Col><div style={cellStyle}>Auto 3</div></Col>
          <Col><div style={cellStyle}>Auto 3</div></Col>
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

      <Title size="h3" style="margin-bottom: 12px">Nested grids</Title>
      <Container style="margin-bottom: 24px;">
        <Row>
          <Col size={6}>
            <div style={cellStyle}>
              Outer Col 6
              <Container style="margin-top: 8px;">
                <Row>
                  <Col size={6}><div style={altCellStyle}>Inner 6</div></Col>
                  <Col size={6}><div style={altCellStyle}>Inner 6</div></Col>
                </Row>
              </Container>
            </div>
          </Col>
          <Col size={6}>
            <div style={cellStyle}>
              Outer Col 6
              <Container style="margin-top: 8px;">
                <Row>
                  <Col size={4}><div style={altCellStyle}>4</div></Col>
                  <Col size={4}><div style={altCellStyle}>4</div></Col>
                  <Col size={4}><div style={altCellStyle}>4</div></Col>
                </Row>
              </Container>
            </div>
          </Col>
        </Row>
      </Container>

      <Title size="h3" style="margin-bottom: 12px">8-card dashboard layout</Title>
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
