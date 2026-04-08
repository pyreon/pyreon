import { kinetic, slideUp } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

const StaggerMenu = kinetic('div').preset(slideUp).stagger({ interval: 75 })

const itemStyle =
  'padding: 12px 16px; background: #f3f4f6; border-radius: 6px; font-size: 14px;'

export function AnimationsStaggerDemo() {
  const open = signal(true)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Stagger Animation</Title>
      <Paragraph style="margin-bottom: 24px">
        Animate children with a delay between each — useful for menus and lists.
      </Paragraph>

      <Button state="primary" onClick={() => open.set(!open())} style="margin-bottom: 16px;">
        Toggle Menu
      </Button>

      <StaggerMenu show={() => open()} style="display: flex; flex-direction: column; gap: 8px; max-width: 280px;">
        <div style={itemStyle}>Dashboard</div>
        <div style={itemStyle}>Projects</div>
        <div style={itemStyle}>Tasks</div>
        <div style={itemStyle}>Calendar</div>
        <div style={itemStyle}>Settings</div>
      </StaggerMenu>
    </div>
  )
}
