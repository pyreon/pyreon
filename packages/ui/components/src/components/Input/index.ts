import { el } from '../../factory'

const Input = el
  .config({ name: 'Input' })
  .attrs({ tag: 'input', block: true })
  .theme((t: any) => ({
    width: '100%',
    backgroundColor: t.color.system.light.base,
    color: t.color.system.dark[800],
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    transition: t.transition.fast,
    outline: 'none',
    focus: {
      borderColor: t.color.system.primary.base,
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      backgroundColor: t.color.system.base[50],
    },
    placeholder: {
      color: t.color.system.base[400],
    },
  }))
  .states((t: any) => ({
    error: {
      borderColor: t.color.system.error.base,
      focus: { boxShadow: `0 0 0 3px ${t.color.system.error[200]}` },
    },
    success: {
      borderColor: t.color.system.success.base,
      focus: { boxShadow: `0 0 0 3px ${t.color.system.success[200]}` },
    },
  }))
  .sizes((t: any) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.small,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.base,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xSmall,
      paddingBottom: t.spacing.xSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      borderRadius: t.borderRadius.medium,
    },
  }))
  .variants((t: any) => ({
    outline: {},
    filled: {
      backgroundColor: t.color.system.base[100],
      borderColor: t.color.system.transparent,
      focus: {
        backgroundColor: t.color.system.light.base,
        borderColor: t.color.system.primary.base,
      },
    },
    underline: {
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderRadius: 0,
      paddingLeft: 0,
      paddingRight: 0,
      focus: {
        boxShadow: 'none',
        borderBottomColor: t.color.system.primary.base,
      },
    },
  }))

export default Input

export const Textarea = el
  .config({ name: 'Textarea' })
  .attrs({ tag: 'textarea', block: true })
  .theme((t: any) => ({
    width: '100%',
    backgroundColor: t.color.system.light.base,
    color: t.color.system.dark[800],
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    transition: t.transition.fast,
    outline: 'none',
    resize: 'vertical',
    focus: {
      borderColor: t.color.system.primary.base,
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      backgroundColor: t.color.system.base[50],
    },
    placeholder: {
      color: t.color.system.base[400],
    },
  }))
  .states((t: any) => ({
    error: {
      borderColor: t.color.system.error.base,
      focus: { boxShadow: `0 0 0 3px ${t.color.system.error[200]}` },
    },
    success: {
      borderColor: t.color.system.success.base,
      focus: { boxShadow: `0 0 0 3px ${t.color.system.success[200]}` },
    },
  }))
  .sizes((t: any) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.small,
      minHeight: '60px',
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.base,
      minHeight: '80px',
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xSmall,
      paddingBottom: t.spacing.xSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      borderRadius: t.borderRadius.medium,
      minHeight: '120px',
    },
  }))
  .variants((t: any) => ({
    outline: {},
    filled: {
      backgroundColor: t.color.system.base[100],
      borderColor: t.color.system.transparent,
      focus: {
        backgroundColor: t.color.system.light.base,
        borderColor: t.color.system.primary.base,
      },
    },
    underline: {
      borderTopWidth: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
      borderRadius: 0,
      paddingLeft: 0,
      paddingRight: 0,
      focus: {
        boxShadow: 'none',
        borderBottomColor: t.color.system.primary.base,
      },
    },
  }))
