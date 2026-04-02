import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

/** Text input field. */
const Input = rocketstyle({ useBooleans: true })({ name: 'Input', component: Element })
  .attrs({ tag: 'input', block: true } as any)
  .theme({
    fontSize: 14,
    lineHeight: 1.5,
    color: '#111827',
    backgroundColor: '#ffffff',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    outline: 'none',
    transition: 'border-color 200ms ease, box-shadow 200ms ease',
    width: '100%',
    focus: {
      borderColor: '#3b82f6',
      boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.15)',
    },
  })
  .states({
    error: {
      borderColor: '#ef4444',
      focus: {
        borderColor: '#ef4444',
        boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.15)',
      },
    },
    success: {
      borderColor: '#22c55e',
      focus: {
        borderColor: '#22c55e',
        boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.15)',
      },
    },
  })
  .sizes({
    sm: { fontSize: 12, paddingTop: 6, paddingBottom: 6, paddingLeft: 10, paddingRight: 10, borderRadius: 4 },
    md: { fontSize: 14, paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 12, borderRadius: 6 },
    lg: { fontSize: 16, paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 14, borderRadius: 8 },
  })
  .variants({
    outline: {},
    filled: {
      backgroundColor: '#f3f4f6',
      borderColor: 'transparent',
      focus: { backgroundColor: '#ffffff', borderColor: '#3b82f6' },
    },
    underline: {
      borderRadius: 0,
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: 2,
      paddingLeft: 0,
      paddingRight: 0,
    },
  })

export default Input

/** Multi-line text input. */
export const Textarea = rocketstyle({ useBooleans: true })({ name: 'Textarea', component: Element })
  .attrs({ tag: 'textarea', block: true } as any)
  .theme({
    fontSize: 14,
    lineHeight: 1.5,
    color: '#111827',
    backgroundColor: '#ffffff',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    outline: 'none',
    transition: 'border-color 200ms ease, box-shadow 200ms ease',
    width: '100%',
    minHeight: 80,
    resize: 'vertical',
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
    success: {
      borderColor: '#22c55e',
      focus: { borderColor: '#22c55e', boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.15)' },
    },
  })
  .sizes({
    sm: { fontSize: 12, paddingTop: 6, paddingBottom: 6, paddingLeft: 10, paddingRight: 10, minHeight: 60 },
    md: { fontSize: 14, paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 12, minHeight: 80 },
    lg: { fontSize: 16, paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 14, minHeight: 120 },
  })
