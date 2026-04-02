import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { RadioBase, RadioGroupBase } from '@pyreon/ui-primitives'

/** Single radio option — must be inside a RadioGroup. */
const Radio = rocketstyle({ useBooleans: true })({ name: 'Radio', component: RadioBase as any })
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

export default Radio

/** Radio group container — manages shared selection state. */
export const RadioGroup = rocketstyle({ useBooleans: true })({ name: 'RadioGroup', component: RadioGroupBase as any })
  .theme({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  })
  .variants({
    vertical: { flexDirection: 'column' },
    horizontal: { flexDirection: 'row', gap: 16 },
  })
