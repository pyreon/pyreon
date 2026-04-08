import { fade, kinetic } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

const Backdrop = kinetic('div').preset(fade)

// Spring scale dialog
const Dialog = kinetic('div')
  .enter({ opacity: 0, transform: 'scale(0.9)' })
  .enterTo({ opacity: 1, transform: 'scale(1)' })
  .enterTransition('all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)')
  .leave({ opacity: 1, transform: 'scale(1)' })
  .leaveTo({ opacity: 0, transform: 'scale(0.95)' })
  .leaveTransition('all 200ms ease-in')

export function AnimationsModalPatternDemo() {
  const open = signal(false)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">Modal Pattern</Title>
      <Paragraph style="margin-bottom: 24px">
        Backdrop fade + dialog spring scale composed via kinetic style-object API. The dialog uses cubic-bezier overshoot for a tactile spring feel.
      </Paragraph>

      <Button state="primary" onClick={() => open.set(true)}>Open Modal</Button>

      <Backdrop
        show={() => open()}
        style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 50;"
        onClick={(e: MouseEvent) => {
          if (e.target === e.currentTarget) open.set(false)
        }}
      >
        <Dialog
          show={() => open()}
          style="max-width: 480px; width: 100%; padding: 32px; background: white; border-radius: 12px; box-shadow: 0 25px 50px rgba(0,0,0,0.25); margin: 16px;"
        >
          <Title size="h3" style="margin-bottom: 12px">Spring Modal</Title>
          <Paragraph style="margin-bottom: 24px">
            Press Escape or click the backdrop to close. Watch the spring overshoot on enter.
          </Paragraph>
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <Button state="secondary" variant="ghost" onClick={() => open.set(false)}>
              Cancel
            </Button>
            <Button state="primary" onClick={() => open.set(false)}>
              Confirm
            </Button>
          </div>
        </Dialog>
      </Backdrop>
    </div>
  )
}
