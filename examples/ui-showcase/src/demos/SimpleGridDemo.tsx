import { GridContainer, GridRow, GridCol } from '@pyreon/ui-components'

const coloredBox = (color: string, label: string) => (
  <div style={`padding: 24px; background: ${color}; border-radius: 6px; text-align: center; font-weight: 600; color: #fff;`}>
    {label}
  </div>
)

export function SimpleGridDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Grid (CoolGrid)</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Responsive 12-column grid system via GridContainer, GridRow, GridCol.
      </p>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Equal Columns</h3>
        <GridContainer>
          <GridRow>
            <GridCol>{coloredBox('#6366f1', '1/3')}</GridCol>
            <GridCol>{coloredBox('#818cf8', '2/3')}</GridCol>
            <GridCol>{coloredBox('#a5b4fc', '3/3')}</GridCol>
          </GridRow>
        </GridContainer>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Two Columns</h3>
        <GridContainer>
          <GridRow>
            <GridCol size={6}>{coloredBox('#059669', 'Left (6)')}</GridCol>
            <GridCol size={6}>{coloredBox('#10b981', 'Right (6)')}</GridCol>
          </GridRow>
        </GridContainer>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Sidebar Layout</h3>
        <GridContainer>
          <GridRow>
            <GridCol size={4}>{coloredBox('#dc2626', 'Sidebar (4)')}</GridCol>
            <GridCol size={8}>{coloredBox('#ef4444', 'Content (8)')}</GridCol>
          </GridRow>
        </GridContainer>
      </section>

      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Four Columns</h3>
        <GridContainer>
          <GridRow>
            <GridCol size={3}>{coloredBox('#f59e0b', '3')}</GridCol>
            <GridCol size={3}>{coloredBox('#fbbf24', '3')}</GridCol>
            <GridCol size={3}>{coloredBox('#fcd34d', '3')}</GridCol>
            <GridCol size={3}>{coloredBox('#fde68a', '3')}</GridCol>
          </GridRow>
        </GridContainer>
      </section>
    </div>
  )
}
