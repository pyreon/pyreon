import rocketstyle from '@pyreon/rocketstyle'
import { TabsBase, TabBase, TabPanelBase } from '@pyreon/ui-primitives'

const rs = rocketstyle({ useBooleans: true })

const Tabs = rs({ name: 'Tabs', component: TabsBase })
  .theme((t: any) => ({
    display: 'flex',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: t.color.system.base[200],
    gap: 0,
  }))
  .variants((t: any) => ({
    line: {},
    enclosed: {
      borderBottomWidth: 0,
      gap: t.spacing.xxxSmall,
    },
    pills: {
      borderBottomWidth: 0,
      gap: t.spacing.xxxSmall,
    },
  }))

export default Tabs

export const Tab = rs({ name: 'Tab', component: TabBase })
  .theme((t: any) => ({
    color: t.color.system.base[500],
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.medium,
    cursor: 'pointer',
    paddingTop: t.spacing.xxSmall,
    paddingBottom: t.spacing.xxSmall,
    paddingLeft: t.spacing.small,
    paddingRight: t.spacing.small,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    transition: t.transition.fast,
    whiteSpace: 'nowrap',
    hover: { color: t.color.system.base[700] },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
      borderRadius: t.borderRadius.small,
    },
    active: {
      borderBottomColor: t.color.system.primary.base,
      color: t.color.system.primary.text,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))
  .variants((t: any) => ({
    line: {},
    enclosed: {
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderBottomWidth: 0,
      borderRadius: `${t.borderRadius.base} ${t.borderRadius.base} 0 0`,
      active: {
        borderColor: t.color.system.base[200],
        backgroundColor: t.color.system.light.base,
      },
    },
    pills: {
      borderBottomWidth: 0,
      borderRadius: t.borderRadius.base,
      active: {
        backgroundColor: t.color.system.primary.base,
        color: t.color.system.light.base,
      },
    },
  }))

export const TabPanel = rs({ name: 'TabPanel', component: TabPanelBase })
  .theme((t: any) => ({
    paddingTop: t.spacing.small,
  }))
