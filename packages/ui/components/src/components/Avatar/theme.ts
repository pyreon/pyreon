import { defineComponentTheme } from '@pyreon/ui-theme'

export const avatarTheme = defineComponentTheme('Avatar', (t, m) => ({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: m(t.colors.gray[200], t.colors.gray[700]),
    color: m(t.colors.gray[600], t.colors.gray[300]),
    fontWeight: t.fontWeight.medium,
    fontFamily: t.fontFamily.sans,
    overflow: 'hidden',
    flexShrink: 0,
  },
  sizes: {
    xs: { width: '24px', height: '24px', fontSize: t.fontSize.xs },
    sm: { width: '32px', height: '32px', fontSize: t.fontSize.sm },
    md: { width: '40px', height: '40px', fontSize: t.fontSize.md },
    lg: { width: '48px', height: '48px', fontSize: t.fontSize.lg },
    xl: { width: '64px', height: '64px', fontSize: t.fontSize.xl },
  },
  variants: {
    circle: { borderRadius: t.radii.full },
    rounded: { borderRadius: t.radii.md },
  },
}))

export const avatarGroupTheme = defineComponentTheme('AvatarGroup', (t) => ({
  base: {
    display: 'inline-flex',
    flexDirection: 'row-reverse',
    gap: `-${t.spacing[2]}`,
  },
}))
