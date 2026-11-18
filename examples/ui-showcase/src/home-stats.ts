import { navGroups } from './nav'

/**
 * The library sizes the home page states. They are written out rather than
 * computed so the home page does not import every component and preset; the
 * test in `tests/home-stats.test.ts` counts the real exports and fails when a
 * number here goes stale.
 */
export const LIBRARY_COUNTS = {
  /** Components exported by `@pyreon/ui-components`. */
  components: 110,
  /** Entries of `presets` in `@pyreon/kinetic-presets`. */
  presets: 122,
  /** `use*` hooks exported by `@pyreon/hooks`. */
  hooks: 65,
} as const

/** Sidebar groups that demo something other than a UI component. */
const NON_COMPONENT_GROUPS = new Set(['Animations', 'Hooks', 'Architecture'])

/** Component demo pages, counted from the sidebar this app renders. */
export const componentDemoCount = navGroups
  .filter((group) => !NON_COMPONENT_GROUPS.has(group.label))
  .reduce((total, group) => total + group.items.length, 0)

/** Sidebar categories. */
export const categoryCount = navGroups.length
