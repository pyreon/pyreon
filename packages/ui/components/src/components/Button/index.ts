import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Button = rocketstyle({ useBooleans: true })({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center', alignY: 'center' } as any)
  .theme({
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 500,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    transition: 'all 200ms ease',
    lineHeight: 1.5,
    display: 'inline-flex',
    gap: 8,
    whiteSpace: 'nowrap',
    userSelect: 'none',
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
    success: {
      backgroundColor: '#22c55e',
      color: '#ffffff',
      hover: { backgroundColor: '#16a34a' },
    },
  })
  .sizes({
    xs: { fontSize: 12, paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8, borderRadius: 4 },
    sm: { fontSize: 14, paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 12, borderRadius: 6 },
    md: { fontSize: 14, paddingTop: 8, paddingBottom: 8, paddingLeft: 16, paddingRight: 16, borderRadius: 6 },
    lg: { fontSize: 16, paddingTop: 10, paddingBottom: 10, paddingLeft: 20, paddingRight: 20, borderRadius: 8 },
    xl: { fontSize: 18, paddingTop: 12, paddingBottom: 12, paddingLeft: 24, paddingRight: 24, borderRadius: 8 },
  })
  .variants({
    solid: {},
    outline: {
      backgroundColor: 'transparent',
      borderColor: '#3b82f6',
      color: '#3b82f6',
      hover: { backgroundColor: '#eff6ff' },
    },
    subtle: {
      backgroundColor: '#eff6ff',
      color: '#2563eb',
      hover: { backgroundColor: '#dbeafe' },
    },
    ghost: {
      backgroundColor: 'transparent',
      color: '#3b82f6',
      hover: { backgroundColor: '#f3f4f6' },
    },
    link: {
      backgroundColor: 'transparent',
      color: '#3b82f6',
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      textDecoration: 'underline',
      hover: { color: '#2563eb' },
    },
  })

export default Button

export const IconButton = rocketstyle({ useBooleans: true })({ name: 'IconButton', component: Element })
  .attrs({ tag: 'button', alignX: 'center', alignY: 'center' } as any)
  .theme({
    backgroundColor: 'transparent',
    color: '#6b7280',
    borderRadius: 6,
    borderWidth: 0,
    cursor: 'pointer',
    transition: 'all 200ms ease',
    display: 'inline-flex',
    padding: 8,
    hover: { backgroundColor: '#f3f4f6', color: '#111827' },
  })
  .sizes({
    xs: { padding: 4, fontSize: 14 },
    sm: { padding: 6, fontSize: 16 },
    md: { padding: 8, fontSize: 18 },
    lg: { padding: 10, fontSize: 20 },
  })

export const CloseButton = rocketstyle({ useBooleans: true })({ name: 'CloseButton', component: Element })
  .attrs({ tag: 'button', 'aria-label': 'Close', alignX: 'center', alignY: 'center' } as any)
  .theme({
    backgroundColor: 'transparent',
    color: '#9ca3af',
    borderRadius: 4,
    borderWidth: 0,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    display: 'inline-flex',
    padding: 4,
    hover: { backgroundColor: '#f3f4f6', color: '#374151' },
  })
  .sizes({
    sm: { padding: 2, fontSize: 14 },
    md: { padding: 4, fontSize: 16 },
    lg: { padding: 6, fontSize: 18 },
  })
