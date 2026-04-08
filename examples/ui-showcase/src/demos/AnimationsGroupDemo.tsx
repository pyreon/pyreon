import { fade, kinetic, slideRight } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

const GroupList = kinetic('div').preset(fade).group()
const ToastGroup = kinetic('div').preset(slideRight).group()

export function AnimationsGroupDemo() {
  const items = signal([
    { id: 1, label: 'First item' },
    { id: 2, label: 'Second item' },
    { id: 3, label: 'Third item' },
  ])
  let nextId = 4

  const addItem = () => {
    items.set([...items(), { id: nextId++, label: `Item ${nextId - 1}` }])
  }
  const removeItem = (id: number) => {
    items.set(items().filter((i) => i.id !== id))
  }
  const shuffle = () => {
    items.set([...items()].sort(() => Math.random() - 0.5))
  }

  const toasts = signal<{ id: number; message: string }[]>([])
  let toastId = 0
  const addToast = () => {
    const id = toastId++
    toasts.set([...toasts(), { id, message: `Toast #${id}` }])
    setTimeout(() => toasts.set(toasts().filter((t) => t.id !== id)), 3000)
  }

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Group (Key-Based Lists)</Title>
      <Paragraph style="margin-bottom: 24px">
        Animate items entering and leaving a list with stable keys.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">List</Title>
      <div style="margin-bottom: 24px;">
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <Button state="primary" onClick={addItem}>Add</Button>
          <Button state="secondary" onClick={shuffle}>Shuffle</Button>
        </div>
        <GroupList style="display: flex; flex-direction: column; gap: 8px; max-width: 320px;">
          {() =>
            items().map((item) => (
              <div
                key={item.id}
                style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f3f4f6; border-radius: 6px;"
              >
                <span>{item.label}</span>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  style="border: none; background: none; cursor: pointer; color: #ef4444; font-size: 18px;"
                >
                  ×
                </button>
              </div>
            ))
          }
        </GroupList>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Toast Notifications (auto-dismiss)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={addToast} style="margin-bottom: 12px;">
          Show Toast
        </Button>
        <ToastGroup style="display: flex; flex-direction: column; gap: 8px; max-width: 280px;">
          {() =>
            toasts().map((t) => (
              <div
                key={t.id}
                style="padding: 12px 16px; background: #1f2937; color: white; border-radius: 6px;"
              >
                {t.message}
              </div>
            ))
          }
        </ToastGroup>
      </div>
    </div>
  )
}
