import { el } from '../../factory'
import { TabsBase, TabBase, TabPanelBase } from '@pyreon/ui-primitives'

const Tabs = el.config({ name: 'Tabs', component: TabsBase })
  .theme((t) => ({
    display: 'flex',
    borderWidthBottom: 1,
    borderStyleBottom: 'solid',
    borderColorBottom: t.color.system.base[200],
    gap: 0,
  }))
  .variants((t) => ({
    line: {},
    enclosed: {
      borderWidthBottom: 0,
      gap: t.spacing.xxxSmall,
    },
    pills: {
      borderWidthBottom: 0,
      gap: t.spacing.xxxSmall,
    },
  }))

export default Tabs

export const Tab = el.config({ name: 'Tab', component: TabBase })
  .theme((t) => ({
    color: t.color.system.base[500],
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.medium,
    cursor: 'pointer',
    paddingTop: t.spacing.xxSmall,
    paddingBottom: t.spacing.xxSmall,
    paddingLeft: t.spacing.small,
    paddingRight: t.spacing.small,
    borderWidthBottom: 2,
    borderStyleBottom: 'solid',
    borderColorBottom: 'transparent',
    transition: t.transition.fast,
    whiteSpace: 'nowrap',
    hover: {
      color: t.color.system.base[700],
    },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
      borderRadius: t.borderRadius.small,
    },
    active: {
      borderColorBottom: t.color.system.primary.base,
      color: t.color.system.primary.text,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))
  .variants((t) => ({
    line: {},
    enclosed: {
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderWidthBottom: 0,
      borderRadius: `${t.borderRadius.base} ${t.borderRadius.base} 0 0`,
      active: {
        borderColor: t.color.system.base[200],
        backgroundColor: t.color.system.light.base,
      },
    },
    pills: {
      borderWidthBottom: 0,
      borderRadius: t.borderRadius.base,
      active: {
        backgroundColor: t.color.system.primary.base,
        color: t.color.system.light.base,
      },
    },
  }))

export const TabPanel = el.config({ name: 'TabPanel', component: TabPanelBase }).theme((t) => ({
  paddingTop: t.spacing.small,
}))
