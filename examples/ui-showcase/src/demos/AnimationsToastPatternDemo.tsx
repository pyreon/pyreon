import { kinetic, slideRight } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

const ToastGroup = kinetic('div').preset(slideRight).group()

interface Toast {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
}

const colors: Record<Toast['type'], string> = {
  info: '#3b82f6',
  success: '#10b981',
  error: '#ef4444',
}

export function AnimationsToastPatternDemo() {
  const toasts = signal<Toast[]>([])
  let nextId = 0

  const add = (type: Toast['type']) => {
    const id = nextId++
    const message = `${type[0]?.toUpperCase()}${type.slice(1)} toast #${id}`
    toasts.set([...toasts(), { id, message, type }])
    setTimeout(() => {
      toasts.set(toasts().filter((t) => t.id !== id))
    }, 3000)
  }

  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">Toast Notifications Pattern</Title>
      <Paragraph style="margin-bottom: 24px">
        Group mode (`.group()`) animates items entering/leaving a list with stable keys. Each toast auto-dismisses after 3 seconds.
      </Paragraph>

      <div style="display: flex; gap: 8px; margin-bottom: 24px;">
        <Button state="primary" onClick={() => add('info')}>Info</Button>
        <Button state="success" onClick={() => add('success')}>Success</Button>
        <Button state="danger" onClick={() => add('error')}>Error</Button>
      </div>

      <ToastGroup style="position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 8px; max-width: 320px; z-index: 100;">
        {() =>
          toasts().map((toast) => (
            <div
              key={toast.id}
              style={() =>
                `padding: 12px 16px; background: ${colors[toast.type]}; color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;`
              }
            >
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => toasts.set(toasts().filter((t) => t.id !== toast.id))}
                style="background: none; border: none; color: white; cursor: pointer; font-size: 18px; padding: 0;"
              >
                ×
              </button>
            </div>
          ))
        }
      </ToastGroup>
    </div>
  )
}
