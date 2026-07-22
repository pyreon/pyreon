/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, mergeProps, splitProps } from '@pyreon/core'
import {
  ComboboxBase,
  type ComboboxBaseProps,
  type ComboboxState,
} from '@pyreon/ui-primitives'
import { disabledState, el, focusRingTone } from '../../factory'
import type { Theme } from '@pyreon/ui-theme'

/**
 * Combobox — batteries-included WAI-ARIA combobox (Element-first composition):
 * `<Combobox options={…} />` renders its own accessible input + dropdown
 * listbox wired to `ComboboxBase`'s props-getters. Behavior/ARIA from the base
 * (ArrowUp/Down open+navigate, Home/End, Enter select, Escape/Tab close,
 * type-ahead, `aria-expanded`/`aria-activedescendant` GETTERS, filtering);
 * STRUCTURE from Element content-axis props; VISUALS from rocketstyle themes.
 * The consumer render-prop remains as the escape hatch (and Autocomplete
 * re-configures the styled chain). i18n: pass `aria-label` (or `id` + an
 * external `<label for>`) on `<Combobox>` — the base's `inputProps()`
 * forwards it onto the `role="combobox"` input; `placeholder` flows to the
 * built-in input.
 */

/** Shared input theme — used by the styled escape-hatch chain AND the
 *  built-in input atom, so the two paths can never drift. */
const inputTheme = (t: Theme) => ({
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
  focus: { ...focusRingTone(t, 'primary'), borderColor: t.color.system.primary.base },
  disabled: { ...disabledState(), backgroundColor: t.color.system.base[50] },
  placeholder: {
    color: t.color.system.base[400],
  },
})

const inputStates = (t: Theme) => ({
  error: {
    borderColor: t.color.system.error.base,
    focus: focusRingTone(t, 'error'),
  },
})

const inputSizes = (t: Theme) => ({
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
})

/**
 * The render-prop ESCAPE-HATCH chain — the pre-conversion Combobox. The
 * consumer renders their own input and spreads `inputProps()`, which carries
 * this chain's theme class via the base's rest-forwarding. `Autocomplete`
 * re-configures THIS chain (`ComboboxStyled.config({ name: 'Autocomplete' })`).
 */
export const ComboboxStyled = el
  .config({ name: 'Combobox', component: ComboboxBase })
  .theme(inputTheme)
  .states(inputStates)
  .sizes(inputSizes)

/** Positioning context for the dropdown — a plain block wrapper. */
const ComboboxRoot = el
  .config({ name: 'ComboboxRoot' })
  .attrs({ tag: 'div', block: true })
  .theme(() => ({
    position: 'relative',
  }))

/**
 * The built-in input. Same name + theme chains as the escape hatch, with a
 * `size` DEFAULT (the base theme deliberately has no padding — it lives in
 * `.sizes()` — so without a default the zero-config input would be unpadded).
 * A consumer's own `size`/`state` props win over the default (direct props
 * beat `.attrs()`).
 */
const ComboboxInput = el
  .config({ name: 'Combobox' })
  .attrs({ tag: 'input', size: 'medium' })
  .theme(inputTheme)
  .states(inputStates)
  .sizes(inputSizes)

/** The dropdown panel — a column list via Element CONTENT-axis props. */
const ComboboxListbox = el
  .config({ name: 'ComboboxListbox' })
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'left',
    contentAlignY: 'top',
  })
  .theme((t) => ({
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: t.spacing.xxSmall,
    paddingTop: t.spacing.xxSmall,
    paddingBottom: t.spacing.xxSmall,
    backgroundColor: t.color.system.light.base,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[200],
    borderRadius: t.borderRadius.base,
    boxShadow: t.shadows.medium,
    maxHeight: 240,
    overflowY: 'auto',
    zIndex: 10,
  }))

/**
 * One option row. Highlight + selection are STATIC CSS keyed on accessor'd
 * attributes (the Rating `data-filled` pattern): `data-highlighted` follows
 * `highlightedIndex()` and `aria-selected` follows `isSelected()` — both flip
 * via renderEffects, so arrow keys and (multi-)select never re-render the
 * list. Comfortable touch-target paddings per the code-style minimum.
 */
const ComboboxOption = el
  .config({ name: 'ComboboxOption' })
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center',
    block: true,
  })
  .theme((t) => ({
    cursor: 'pointer',
    fontSize: t.fontSize.small,
    color: t.color.system.dark[800],
    paddingTop: t.spacing.xxSmall,
    paddingBottom: t.spacing.xxSmall,
    paddingLeft: t.spacing.small,
    paddingRight: t.spacing.small,
    transition: t.transition.fast,
    hover: {
      backgroundColor: t.color.system.base[100],
    },
    extendCss: `
      &[data-highlighted='true'] { background-color: ${t.color.system.base[100]}; }
      &[aria-selected='true'] {
        background-color: ${t.color.system.primary[50]};
        color: ${t.color.system.primary[700]};
      }
      &[aria-disabled='true'] { opacity: 0.5; cursor: default; }
    `,
  }))

export interface ComboboxProps extends ComboboxBaseProps {
  /** Consumer render-prop ESCAPE HATCH — overrides the built-in markup. */
  children?: (state: ComboboxState) => VNodeChild
}

/**
 * The dropdown renders inside a `{() => isOpen() ? … : null}` reactive
 * accessor — re-rendering the option list on open/filter is CORRECT here
 * (focus stays in the input; the listbox uses `aria-activedescendant`, not
 * roving tabindex, so remounts can't drop focus — the opposite trade-off
 * from Tree's keyed `<For>`). Per-option highlight/selection ride accessor'd
 * attributes so arrow keys never re-render the list.
 */
export const Combobox: ComponentFn<ComboboxProps> = (props) => {
  const [own, rest] = splitProps(props, ['children', 'placeholder'])

  // Escape hatch: a consumer render-prop replaces the built-in markup — the
  // exact pre-conversion component (styled chain, all props verbatim).
  if (typeof own.children === 'function') {
    return h(ComboboxStyled as never, props) as unknown as VNodeChild
  }

  return h(ComboboxBase as never, {
    ...rest,
    children: (s: ComboboxState) =>
      h(
        ComboboxRoot as never,
        null,
        // mergeProps, NOT object spread: `inputProps()` carries GETTER-shaped
        // live ARIA (aria-expanded/-activedescendant) — a JS spread would fire
        // the getters and freeze them (the descriptor-copy rule).
        h(
          ComboboxInput as never,
          mergeProps(s.inputProps(), {
            type: 'text',
            value: () => s.query(),
            onInput: (e: Event) => s.setQuery((e.target as HTMLInputElement).value),
            onFocus: () => s.open(),
            onKeyDown: s.onKeyDown,
            placeholder: () => own.placeholder,
            disabled: () => (props.disabled as boolean | undefined),
          }),
        ),
        () =>
          s.isOpen()
            ? h(
                ComboboxListbox as never,
                s.listboxProps(),
                ...s.filtered().map((opt, i) =>
                  h(
                    ComboboxOption as never,
                    {
                      ...s.getOptionProps(opt.value, i),
                      // LIVE overrides of the base's snapshot props: selection
                      // can change while the list stays open (multi-select),
                      // and the highlight moves on every arrow key.
                      'aria-selected': () => (s.isSelected(opt.value) ? 'true' : 'false'),
                      'data-highlighted': () =>
                        s.highlightedIndex() === i ? 'true' : undefined,
                      onClick: () => s.select(opt.value),
                    },
                    opt.label,
                  ),
                ),
              )
            : null,
      ),
  }) as unknown as VNodeChild
}

export default Combobox
