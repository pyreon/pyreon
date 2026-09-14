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
/**
 * Authored scenarios for the DATA-DRIVEN components: derivation seeds
 * content by the tag a component renders as, and these render nothing to look
 * at without their data (`Tree` is a 0-height box with no `data`, a
 * `Combobox` with no `options` has nothing to open). Authored args merge over
 * the derived seed, key by key, and an authored scenario wins over a generated
 * one with the same name.
 */
const scenarios = {
  Tree: [
    {
      name: 'Default',
      args: {
        data: [
          {
            id: 'src',
            label: 'src',
            children: [
              { id: 'components', label: 'components', children: [{ id: 'button', label: 'Button.tsx' }] },
              { id: 'index', label: 'index.ts' },
            ],
          },
          { id: 'readme', label: 'README.md' },
        ],
        defaultExpanded: ['src', 'components'],
      },
    },
  ],
  Combobox: [
    {
      name: 'Default',
      args: {
        placeholder: 'Pick a fruit',
        options: [
          { value: 'apple', label: 'Apple' },
          { value: 'banana', label: 'Banana' },
          { value: 'cherry', label: 'Cherry', disabled: true },
        ],
      },
    },
  ],
  TagsInput: [{ name: 'Default', args: { defaultValue: ['pyreon', 'signals'] } }],
  RangeSlider: [{ name: 'Default', args: { defaultValue: [20, 60], min: 0, max: 100 } }],
}

export default {
  theme,
  wrapper: (props: { children?: unknown }) => h(PyreonUI, { theme }, props.children),
  scenarios,
}
