import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Alert = rocketstyle({ useBooleans: true })({ name: 'Alert', component: Element })
  .attrs({ tag: 'div', direction: 'inline', alignY: 'center', block: true } as any)
  .theme({
    backgroundColor: '#eff6ff',
    color: '#1e40af',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    lineHeight: 1.5,
    gap: 8,
    borderLeftWidth: 4,
    borderLeftStyle: 'solid',
    borderLeftColor: '#3b82f6',
  })
  .states({
    info: {
      backgroundColor: '#eff6ff',
      color: '#1e40af',
      borderLeftColor: '#3b82f6',
    },
    success: {
      backgroundColor: '#f0fdf4',
      color: '#166534',
      borderLeftColor: '#22c55e',
    },
    warning: {
      backgroundColor: '#fffbeb',
      color: '#92400e',
      borderLeftColor: '#f59e0b',
    },
    error: {
      backgroundColor: '#fef2f2',
      color: '#991b1b',
      borderLeftColor: '#ef4444',
    },
  })
  .variants({
    subtle: {},
    solid: {
      backgroundColor: '#3b82f6',
      color: '#ffffff',
      borderLeftWidth: 0,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#3b82f6',
    },
  })

export default Alert
