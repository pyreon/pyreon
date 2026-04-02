import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Chip = rocketstyle({ useBooleans: true })({ name: 'Chip', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9999,
    cursor: 'pointer',
    transition: 'all 200ms ease',
    fontSize: 13,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 12,
    paddingRight: 12,
    userSelect: 'none',
  })
  .states({
    primary: { backgroundColor: '#eff6ff', color: '#2563eb' },
    secondary: { backgroundColor: '#f3f4f6', color: '#4b5563' },
    success: { backgroundColor: '#f0fdf4', color: '#16a34a' },
    error: { backgroundColor: '#fef2f2', color: '#dc2626' },
  })
  .sizes({
    sm: { fontSize: 11, paddingTop: 2, paddingBottom: 2, paddingLeft: 8, paddingRight: 8 },
    md: { fontSize: 13, paddingTop: 4, paddingBottom: 4, paddingLeft: 12, paddingRight: 12 },
    lg: { fontSize: 15, paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 16 },
  })
  .variants({
    filled: {},
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: 'currentColor',
    },
  })

export default Chip
