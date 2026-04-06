import { Card, Title, Paragraph, Badge, Button } from '@pyreon/ui-components'

export function CardDemo() {
  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Card</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Container component with 3 visual variants (elevated, outline, filled) for grouping related content.
      </p>

      {/* Variants */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variants</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          <Card {...{ variant: 'elevated' } as any}>
            <Title {...{ size: 'h5' } as any}>Elevated</Title>
            <Paragraph {...{ size: 'sm', style: 'margin-top: 8px;' } as any}>
              Card with a subtle shadow for depth.
            </Paragraph>
          </Card>
          <Card {...{ variant: 'outline' } as any}>
            <Title {...{ size: 'h5' } as any}>Outline</Title>
            <Paragraph {...{ size: 'sm', style: 'margin-top: 8px;' } as any}>
              Card with a border for clear boundaries.
            </Paragraph>
          </Card>
          <Card {...{ variant: 'filled' } as any}>
            <Title {...{ size: 'h5' } as any}>Filled</Title>
            <Paragraph {...{ size: 'sm', style: 'margin-top: 8px;' } as any}>
              Card with a filled background color.
            </Paragraph>
          </Card>
        </div>
      </section>

      {/* With Rich Content — Elevated */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Elevated — Rich Content</h3>
        <div style="max-width: 400px;">
          <Card {...{ variant: 'elevated' } as any}>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <Title {...{ size: 'h4' } as any}>Project Alpha</Title>
              <Badge {...{ state: 'success', size: 'sm' } as any}>Active</Badge>
            </div>
            <Paragraph {...{ size: 'sm', style: 'margin-bottom: 16px;' } as any}>
              A cutting-edge project leveraging signal-based reactivity for optimal performance and developer experience.
            </Paragraph>
            <div style="display: flex; gap: 8px;">
              <Button {...{ state: 'primary', size: 'sm' } as any}>View</Button>
              <Button {...{ state: 'secondary', size: 'sm', variant: 'outline' } as any}>Edit</Button>
            </div>
          </Card>
        </div>
      </section>

      {/* With Rich Content — Outline */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Outline — Dashboard Card</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          <Card {...{ variant: 'outline' } as any}>
            <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Total Users</Paragraph>
            <Title {...{ size: 'h3', style: 'margin-top: 4px;' } as any}>12,847</Title>
            <Paragraph {...{ size: 'sm', style: 'margin-top: 8px; color: #10b981;' } as any}>+12.5% from last month</Paragraph>
          </Card>
          <Card {...{ variant: 'outline' } as any}>
            <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Revenue</Paragraph>
            <Title {...{ size: 'h3', style: 'margin-top: 4px;' } as any}>$48,290</Title>
            <Paragraph {...{ size: 'sm', style: 'margin-top: 8px; color: #10b981;' } as any}>+8.2% from last month</Paragraph>
          </Card>
          <Card {...{ variant: 'outline' } as any}>
            <Paragraph {...{ size: 'sm', style: 'color: #6b7280;' } as any}>Active Sessions</Paragraph>
            <Title {...{ size: 'h3', style: 'margin-top: 4px;' } as any}>1,024</Title>
            <Paragraph {...{ size: 'sm', style: 'margin-top: 8px; color: #ef4444;' } as any}>-3.1% from last hour</Paragraph>
          </Card>
        </div>
      </section>

      {/* With Rich Content — Filled */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Filled — Feature Card</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
          <Card {...{ variant: 'filled' } as any}>
            <div style="font-size: 28px; margin-bottom: 12px;">*</div>
            <Title {...{ size: 'h5' } as any}>Signal Reactivity</Title>
            <Paragraph {...{ size: 'sm', style: 'margin-top: 8px;' } as any}>
              Fine-grained reactivity with zero overhead. Signals track dependencies automatically.
            </Paragraph>
          </Card>
          <Card {...{ variant: 'filled' } as any}>
            <div style="font-size: 28px; margin-bottom: 12px;">#</div>
            <Title {...{ size: 'h5' } as any}>SSR Streaming</Title>
            <Paragraph {...{ size: 'sm', style: 'margin-top: 8px;' } as any}>
              Server-side rendering with Suspense streaming. Progressive hydration for fast TTI.
            </Paragraph>
          </Card>
        </div>
      </section>

      {/* Nested Cards */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Nested Cards</h3>
        <Card {...{ variant: 'outline' } as any}>
          <Title {...{ size: 'h4', style: 'margin-bottom: 12px;' } as any}>Parent Card</Title>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            <Card {...{ variant: 'filled' } as any}>
              <Title {...{ size: 'h6' } as any}>Child A</Title>
              <Paragraph {...{ size: 'sm', style: 'margin-top: 4px;' } as any}>Nested content</Paragraph>
            </Card>
            <Card {...{ variant: 'filled' } as any}>
              <Title {...{ size: 'h6' } as any}>Child B</Title>
              <Paragraph {...{ size: 'sm', style: 'margin-top: 4px;' } as any}>Nested content</Paragraph>
            </Card>
          </div>
        </Card>
      </section>

      {/* Variant Comparison */}
      <section style="margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px;">Variant Comparison</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          {(['elevated', 'outline', 'filled'] as const).map((variant) => (
            <div style="text-align: center;">
              <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px;">{variant}</p>
              <Card {...{ variant } as any}>
                <Title {...{ size: 'h6' } as any}>Card Title</Title>
                <Paragraph {...{ size: 'sm', style: 'margin-top: 4px;' } as any}>Content inside the card.</Paragraph>
                <Button {...{ state: 'primary', size: 'xs', style: 'margin-top: 12px;' } as any}>Action</Button>
              </Card>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
