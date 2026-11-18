import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — coolgrid snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(
      `"- @pyreon/coolgrid — Context-cascading responsive grid — Container, Row, Col with custom columns and breakpoints. Every numeric grid prop (size/gap/gutter/padding/columns) is responsive — a single number, a mobile-first array ([12, 6, 4]), or a breakpoint-keyed object ({ xs: 12, md: 6 }); size 0 hides the column at that breakpoint."`,
    )
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/coolgrid — Responsive Grid

      Bootstrap-style flexbox grid for Pyreon where every numeric prop is responsive (single value, mobile-first array, or breakpoint-keyed object). Configuration (\`columns\`, \`gap\`, \`gutter\`, \`padding\`, \`contentAlignX\`) cascades through Pyreon context — set it on \`Container\` and every nested \`Row\` / \`Col\` inherits, with per-element overrides for that subtree only. Breakpoint names and column counts are theme-driven, not hardcoded: ship with the default Bootstrap-4 theme (12 columns, xs–xl) or define your own (\`{ phone: 0, tablet: 600 }\` × \`columns: 24\`). Built on \`@pyreon/unistyle\` + \`@pyreon/styler\`.

      \`\`\`typescript
      import { PyreonUI } from '@pyreon/ui-core'
      import { Container, Row, Col, theme } from '@pyreon/coolgrid'

      // PyreonUI provides breakpoints, rootSize, and grid defaults to the subtree.
      // A theme without grid keys falls back to coolgrid's defaults.
      <PyreonUI theme={theme}>
        <Container gap={16} gutter={24} padding={16}>
          <Row>
            {/* Responsive size — breakpoint-keyed object */}
            <Col size={{ xs: 12, md: 8 }}>Main content</Col>
            <Col size={{ xs: 12, md: 4 }}>Sidebar</Col>
          </Row>
          {/* Mobile-first array — positional [xs, sm, md, ...]; values cascade up */}
          <Row contentAlignX="center" gap={[8, 16, 24]}>
            <Col size={[12, 6, 4]}>Card</Col>
            <Col size={[12, 6, 4]}>Card</Col>
            {/* size 0 hides the column at that breakpoint */}
            <Col size={{ xs: 0, md: 4 }}>Desktop-only card</Col>
          </Row>
          {/* size on Row = default span for every Col inside */}
          <Row size={6}>
            <Col>Half</Col>
            <Col>Half</Col>
          </Row>
        </Container>
      </PyreonUI>

      // Custom breakpoints + column count via a custom theme:
      <PyreonUI
        theme={{
          rootSize: 16,
          breakpoints: { phone: 0, tablet: 600, desktop: 1024 },
          grid: { columns: 24, container: { phone: '100%', tablet: 540, desktop: 960 } },
        }}
      >
        <Container columns={24}>
          <Row>
            <Col size={16}>Two thirds of 24</Col>
            <Col size={8}>One third of 24</Col>
          </Row>
        </Container>
      </PyreonUI>
      \`\`\`

      > **Note**: Every numeric grid prop (size/gap/gutter/padding/columns) is responsive — a single number, a mobile-first array ([12, 6, 4]), or a breakpoint-keyed object ({ xs: 12, md: 6 }); size 0 hides the column at that breakpoint.
      >
      > **Cascade model**: Container provides the grid config via context; Row merges its own props over it and re-provides for Cols; props set at a deeper level override the ancestor for that subtree only. Cascading keys: \`columns\`, \`size\`, \`gap\`, \`padding\`, \`gutter\`, \`colCss\` / \`colComponent\`, \`rowCss\` / \`rowComponent\`, \`contentAlignX\`.
      >
      > **CSS-variables theming**: Under \`init({ cssVariables: true })\` gap/gutter can arrive as \`var(--…)\` reference strings — the styled helpers detect them (\`isCssVarValue\`) and express the grid math in native \`calc()\` (halving via \`* 0.5\` / \`* -0.5\`; a negative \`calc()\` divisor is invalid CSS). JS arithmetic on a var() string would produce NaN — the historical coolgrid bug class, fixed via the calc() path.
      >
      > **Theme context comes from PyreonUI**: coolgrid has no provider of its own — Container / Row / Col read breakpoints and grid defaults from the \`<PyreonUI theme={…}>\` (from \`@pyreon/ui-core\`) above them. To scope different breakpoints to a subtree, nest another \`<PyreonUI theme={…}>\` there.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(4)
    expect(record['coolgrid/Container']!.notes).toContain('grid')
    expect(record['coolgrid/Container']!.mistakes?.split('\n').length).toBe(4)
  })
})
