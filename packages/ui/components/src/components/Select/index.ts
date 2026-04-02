import rocketstyle from '@pyreon/rocketstyle'
import { SelectBase } from '@pyreon/ui-primitives'

const Select = rocketstyle({ useBooleans: true })({ name: 'Select', component: SelectBase as any })
  .theme({
    fontSize: 14,
    lineHeight: 1.5,
    color: '#111827',
    backgroundColor: '#ffffff',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    outline: 'none',
    transition: 'border-color 200ms ease',
    width: '100%',
    appearance: 'none',
    backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
    backgroundPosition: 'right 8px center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '20px 20px',
    cursor: 'pointer',
    focus: {
      borderColor: '#3b82f6',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.15)',
    },
  })
  .states({
    error: {
      borderColor: '#ef4444',
      focus: { borderColor: '#ef4444', boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.15)' },
    },
  })
  .sizes({
    sm: { fontSize: 12, paddingTop: 6, paddingBottom: 6, paddingLeft: 10, paddingRight: 28 },
    md: { fontSize: 14, paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 32 },
    lg: { fontSize: 16, paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 36 },
  })

export default Select
