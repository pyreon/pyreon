import { h } from '@pyreon/core'
import { theme } from '@pyreon/ui-theme'
import { PyreonUI } from '@pyreon/ui-core'

/**
 * Atlas configuration for `@pyreon/ui-components`.
 *
 * `theme` is what makes the rocketstyle chains readable at all: a chain's
 * dimension VALUES (`state: primary | secondary | …`) live inside
 * `.states((t) => …)` callbacks, so they are data, not types — the only way to
 * know them is to run the chain against a real theme.
 *
 * `wrapper` is a COMPONENT, not a function of children. Writing it as
 * `(children) => h(PyreonUI, …, children)` type-checks against `unknown` and
 * is wrong: Atlas mounts it as a component, so the parameter receives the
 * PROPS OBJECT, which then reaches `h()` as a child and produces
 * `Component <PyreonUI> returned an invalid value` on every scenario.
 */
export default {
  theme,
  wrapper: (props: { children?: unknown }) => h(PyreonUI, { theme }, props.children),
}
