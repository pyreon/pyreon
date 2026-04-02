import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Notification = rocketstyle({ useBooleans: true })({ name: 'Notification', component: Element })
  .attrs({ tag: 'div', direction: 'rows', block: true } as any)
  .theme({
    backgroundColor: '#ffffff',
    color: '#111827',
    padding: 16,
    borderRadius: 8,
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    gap: 12,
    position: 'relative',
    fontSize: 14,
    lineHeight: 1.5,
  })
  .states({
    info: {
      backgroundColor: '#eff6ff',
      color: '#1e40af',
      borderLeftWidth: 4,
      borderLeftStyle: 'solid',
      borderLeftColor: '#3b82f6',
    },
    success: {
      backgroundColor: '#f0fdf4',
      color: '#166534',
      borderLeftWidth: 4,
      borderLeftStyle: 'solid',
      borderLeftColor: '#22c55e',
    },
    warning: {
      backgroundColor: '#fffbeb',
      color: '#92400e',
      borderLeftWidth: 4,
      borderLeftStyle: 'solid',
      borderLeftColor: '#f59e0b',
    },
    error: {
      backgroundColor: '#fef2f2',
      color: '#991b1b',
      borderLeftWidth: 4,
      borderLeftStyle: 'solid',
      borderLeftColor: '#ef4444',
    },
  })

export default Notification
