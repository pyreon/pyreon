import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const ActionIcon = rocketstyle({ useBooleans: true })({ name: 'ActionIcon', component: Element })
  .attrs({ tag: 'button' } as any)
  .theme({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 200ms ease',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
  })
  .states({
    primary: {
      backgroundColor: '#3b82f6',
      color: '#ffffff',
      hover: { backgroundColor: '#2563eb' },
    },
    secondary: {
      backgroundColor: '#6b7280',
      color: '#ffffff',
      hover: { backgroundColor: '#4b5563' },
    },
    danger: {
      backgroundColor: '#ef4444',
      color: '#ffffff',
      hover: { backgroundColor: '#dc2626' },
    },
  })
  .sizes({
    xs: { width: 28, height: 28, fontSize: 14 },
    sm: { width: 32, height: 32, fontSize: 16 },
    md: { width: 36, height: 36, fontSize: 18 },
    lg: { width: 42, height: 42, fontSize: 20 },
    xl: { width: 48, height: 48, fontSize: 22 },
  })
  .variants({
    filled: {},
    outline: {
      backgroundColor: 'transparent',
      borderColor: 'currentColor',
    },
    subtle: {
      backgroundColor: '#eff6ff',
      color: '#2563eb',
      hover: { backgroundColor: '#dbeafe' },
    },
    transparent: {
      backgroundColor: 'transparent',
      color: '#6b7280',
      hover: { backgroundColor: '#f3f4f6' },
    },
  })

export default ActionIcon
