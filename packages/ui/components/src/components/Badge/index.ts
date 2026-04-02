import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Badge = rocketstyle({ useBooleans: true })({ name: 'Badge', component: Text })
  .attrs({ tag: 'span' })
  .theme({
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    fontSize: 12,
    fontWeight: 500,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 9999,
    lineHeight: 1.5,
    display: 'inline-flex',
    whiteSpace: 'nowrap',
  })
  .states({
    primary: { backgroundColor: '#eff6ff', color: '#2563eb' },
    secondary: { backgroundColor: '#f3f4f6', color: '#4b5563' },
    success: { backgroundColor: '#f0fdf4', color: '#16a34a' },
    error: { backgroundColor: '#fef2f2', color: '#dc2626' },
    warning: { backgroundColor: '#fffbeb', color: '#d97706' },
  })
  .sizes({
    sm: { fontSize: 10, paddingLeft: 6, paddingRight: 6, paddingTop: 1, paddingBottom: 1 },
    md: { fontSize: 12, paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2 },
    lg: { fontSize: 14, paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4 },
  })
  .variants({
    solid: {},
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#3b82f6',
    },
    subtle: {},
  })

export default Badge
