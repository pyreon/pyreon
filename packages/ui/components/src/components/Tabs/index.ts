import { makeItResponsive, styles } from '@pyreon/unistyle'
import { disabledState, el, focusRing, tintText, tones } from '../../factory'
import { TabsBase, TabBase, TabListBase, TabPanelBase } from '@pyreon/ui-primitives'

// TabsBase renders a plain <div>, so the layout is theme CSS (Element's
// layout props never reach it). A flex row put the panel beside the tab list
// (#4426): horizontal tabs stack list over panel, vertical tabs sit beside it.
const Tabs = el.config({ name: 'Tabs', component: TabsBase })
  .theme((t) => ({
    display: 'flex',
    flexDirection: 'column',
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
  // `orientation` lives on TabsBase's context and reaches the DOM only as the
  // tab list's `aria-orientation`, so the vertical layout keys on that.
  .styles(
    (css) => css`
      &:has(> [role='tablist'][aria-orientation='vertical']) {
        flex-direction: row;
      }
    `,
  )

export default Tabs

/**
 * The WAI-ARIA `role="tablist"` strip. Wrap your `<Tab>` triggers in it —
 * panels stay outside (APG: a tablist contains only tabs). Required for
 * correct semantics AND for arrow-key navigation scoping (Tab's keyboard nav
 * walks `[role="tab"]` within the nearest `[role="tablist"]`). Inherits
 * `aria-orientation` from `<Tabs orientation="vertical">`.
 */
export const TabList = el.config({ name: 'TabList', component: TabListBase })
  .theme(() => ({
    display: 'flex',
  }))
  .styles(
    (css) => css`
      &[aria-orientation='vertical'] {
        flex-direction: column;
      }
    `,
  )

export const Tab = el.config({ name: 'Tab', component: TabBase })
  .theme((t, m) => ({
    // The base renders a <button>: without these the UA's grey fill and
    // outset border show on every tab.
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: tones(t, m).textMuted,
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
      color: tones(t, m).text,
    },
    focus: { ...focusRing(t), borderRadius: t.borderRadius.small },
    // The selected look. `active` alone compiles to `:active` (pointer held
    // down); the `.styles()` below also applies it to the selected tab.
    active: {
      borderColorBottom: t.color.system.primary.base,
      color: tintText(t, m, 'primary'),
    },
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))
  .variants((t, m) => ({
    line: {},
    enclosed: {
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderWidthBottom: 0,
      borderRadius: `${t.borderRadius.base} ${t.borderRadius.base} 0 0`,
      active: {
        borderColor: t.color.system.base[200],
        // The page colour, so the selected tab joins the panel below it.
        backgroundColor: m(t.color.system.light.base, t.color.system.dark.base),
      },
    },
    pills: {
      borderWidthBottom: 0,
      borderRadius: t.borderRadius.base,
      active: {
        backgroundColor: t.color.system.primary.base,
        color: t.color.system.primary.contrast,
      },
    },
  }))
  // TabBase marks the selected tab with `aria-selected="true"` and owns that
  // state itself (it is never a prop of this component), so the selected look
  // is keyed on the attribute. Without it the selected tab looked exactly like
  // the others.
  .styles(
    (css) => css`
      ${({ $rocketstyle }: { $rocketstyle: { active: Record<string, unknown> } }) => css`
        &[aria-selected='true'] {
          ${makeItResponsive({ theme: $rocketstyle.active, styles, css })};
        }
      `}
    `,
  )

export const TabPanel = el.config({ name: 'TabPanel', component: TabPanelBase }).theme((t) => ({
  paddingTop: t.spacing.small,
}))
