import { defineComponentTheme } from '@pyreon/ui-theme'

export const fileUploadTheme = defineComponentTheme('FileUpload', (t, m) => ({
  base: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: m(t.colors.gray[300], t.colors.gray[600]),
    borderRadius: t.radii.lg,
    padding: t.spacing[8],
    backgroundColor: m(t.colors.gray[50], t.colors.gray[900]),
    textAlign: 'center',
    cursor: 'pointer',
    transition: t.transition.fast,
    hover: {
      borderColor: m(t.colors.primary[400], t.colors.primary[500]),
      backgroundColor: m(t.colors.primary[50], t.colors.primary[950]),
    },
  },
}))
