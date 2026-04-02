import rocketstyle from '@pyreon/rocketstyle'
import { CheckboxBase } from '@pyreon/ui-primitives'

const Checkbox = rocketstyle({ useBooleans: true })({ name: 'Checkbox', component: CheckboxBase as any })
  .theme({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 14,
    color: '#374151',
    lineHeight: 1.5,
    userSelect: 'none',
  })
  .sizes({
    sm: { fontSize: 12, gap: 6 },
    md: { fontSize: 14, gap: 8 },
    lg: { fontSize: 16, gap: 10 },
  })
  .states({
    primary: { color: '#374151' },
    error: { color: '#ef4444' },
  })

export default Checkbox
