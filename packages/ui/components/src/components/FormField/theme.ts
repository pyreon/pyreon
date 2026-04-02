import { defineComponentTheme } from '@pyreon/ui-theme'

export const formFieldTheme = defineComponentTheme('FormField', (t) => ({
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: t.spacing[1],
  },
}))

export const fieldLabelTheme = defineComponentTheme('FieldLabel', (t, m) => ({
  base: {
    fontSize: t.fontSize.sm,
    fontWeight: t.fontWeight.medium,
    color: m(t.colors.gray[700], t.colors.gray[300]),
  },
  sizes: {
    sm: { fontSize: t.fontSize.xs },
    md: { fontSize: t.fontSize.sm },
    lg: { fontSize: t.fontSize.md },
  },
}))

export const fieldErrorTheme = defineComponentTheme('FieldError', (t, m) => ({
  base: {
    fontSize: t.fontSize.xs,
    color: m(t.colors.error[500], t.colors.error[400]),
  },
}))

export const fieldDescriptionTheme = defineComponentTheme('FieldDescription', (t, m) => ({
  base: {
    fontSize: t.fontSize.xs,
    color: m(t.colors.gray[500], t.colors.gray[400]),
  },
}))
