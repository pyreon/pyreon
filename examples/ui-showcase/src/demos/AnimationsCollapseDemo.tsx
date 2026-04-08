import { kinetic } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

const Collapse = kinetic('div').collapse()
const BouncyCollapse = kinetic('div').collapse({
  transition: 'height 500ms cubic-bezier(0.68, -0.55, 0.27, 1.55)',
})

export function AnimationsCollapseDemo() {
  const standardOpen = signal(true)
  const bouncyOpen = signal(false)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Collapse</Title>
      <Paragraph style="margin-bottom: 24px">
        Auto-height accordion animation. Measures content and animates height.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">Standard</Title>
      <div style="margin-bottom: 24px; max-width: 400px;">
        <Button state="primary" onClick={() => standardOpen.set(!standardOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <Collapse show={() => standardOpen()}>
          <div style="padding: 16px; background: #f3f4f6; border-radius: 8px;">
            <p style="margin-bottom: 8px;">This content collapses smoothly.</p>
            <p style="margin-bottom: 8px;">Height is measured automatically.</p>
            <p>You can put any content here, multi-line works perfectly.</p>
          </div>
        </Collapse>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Bouncy (custom easing)</Title>
      <div style="margin-bottom: 24px; max-width: 400px;">
        <Button state="primary" onClick={() => bouncyOpen.set(!bouncyOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <BouncyCollapse show={() => bouncyOpen()}>
          <div style="padding: 16px; background: #fef3c7; border-radius: 8px;">
            <p>Spring overshoot using cubic-bezier(0.68, -0.55, 0.27, 1.55)</p>
          </div>
        </BouncyCollapse>
      </div>
    </div>
  )
}
