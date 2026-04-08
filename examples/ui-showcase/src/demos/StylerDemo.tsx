import { css, keyframes, styled } from '@pyreon/styler'
import { signal } from '@pyreon/reactivity'
import { Title, Paragraph, Button } from '@pyreon/ui-components'

// ── Basic styled component
const Card = styled('div')`
  padding: 24px;
  border-radius: 12px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
`

// ── Dynamic interpolation via typed transient prop
// The <{ $color?: string }> generic gives type-safe access to props
// inside the interpolation function — no casts needed.
const Box = styled('div')<{ $color?: string }>`
  padding: 24px;
  border-radius: 8px;
  color: white;
  text-align: center;
  font-weight: 600;
  background: ${(props) => props.$color || '#0070f3'};
`

// ── Nested selectors
const Menu = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  max-width: 280px;

  & > a {
    padding: 8px 12px;
    border-radius: 6px;
    color: #374151;
    text-decoration: none;
    font-size: 14px;

    &:hover {
      background: #f3f4f6;
      color: #111827;
    }
  }
`

// ── Reusable css fragment
const focusRing = css`
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px #93c5fd;
  }
`

const Input = styled('input')`
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  ${focusRing}
`

// ── Keyframes
const spinKf = keyframes`
  to { transform: rotate(360deg); }
`

const Spinner = styled('div')`
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #0070f3;
  border-radius: 50%;
  animation: ${spinKf.name} 0.6s linear infinite;
`

export function StylerDemo() {
  const color = signal('#0070f3')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Styler — CSS-in-JS</Title>
      <Paragraph style="margin-bottom: 24px">
        `@pyreon/styler` provides tagged template literals for styled components, css fragments, and keyframes.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">styled() — Tagged template</Title>
      <Card style="margin-bottom: 24px">
        <strong>Static styled component.</strong> Padding, background, border all defined in the template.
      </Card>

      <Title size="h3" style="margin-bottom: 12px">Dynamic props (transient $-prefixed)</Title>
      <div style="display: flex; gap: 12px; margin-bottom: 12px;">
        <Button state="primary" onClick={() => color.set('#0070f3')}>Blue</Button>
        <Button state="primary" onClick={() => color.set('#10b981')}>Green</Button>
        <Button state="danger" onClick={() => color.set('#ef4444')}>Red</Button>
      </div>
      <Box $color={color()} style="margin-bottom: 24px">background: ${'$'}color</Box>

      <Title size="h3" style="margin-bottom: 12px">Nested selectors</Title>
      <Menu style="margin-bottom: 24px">
        <a href="#">Dashboard</a>
        <a href="#">Projects</a>
        <a href="#">Settings</a>
      </Menu>

      <Title size="h3" style="margin-bottom: 12px">Reusable css fragments</Title>
      <Input type="text" placeholder="Focus me — uses focusRing fragment" style="margin-bottom: 24px; width: 300px;" />

      <Title size="h3" style="margin-bottom: 12px">keyframes()</Title>
      <Spinner />
    </div>
  )
}
