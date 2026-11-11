/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, splitProps } from '@pyreon/core'
import { TagsInputBase, type TagsInputBaseProps, type TagsInputState } from '@pyreon/ui-primitives'
import { el, tones } from '../../factory'

/**
 * ELEMENT-FIRST COMPOSITION (second conversion after the Rating pilot):
 * batteries-included markup from Element atoms wired to TagsInputBase's
 * props-getters — layout via Element content-axis props, zero hand-written
 * `display` CSS (flexWrap stays as theme CSS: wrapping is a CSS detail, not
 * a display-mode). Render-prop remains the escape hatch.
 */

/** The bordered chips row — layout via Element props. */
const TagsRoot = el
  .config({ name: 'TagsInput' })
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center',
    gap: 1,
  })
  .theme((t, m) => ({
    flexWrap: 'wrap',
    padding: t.spacing.xxSmall,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: tones(t, m).border,
    borderRadius: t.borderRadius.base,
    backgroundColor: tones(t, m).surface,
  }))

/** One committed tag chip. */
const TagChip = el
  .config({ name: 'TagChip' })
  .attrs({
    tag: 'span',
    contentDirection: 'inline',
    contentAlignX: 'left',
    contentAlignY: 'center',
    gap: 1,
  })
  .theme((t, m) => ({
    paddingTop: t.spacing.xxxSmall,
    paddingBottom: t.spacing.xxxSmall,
    paddingLeft: t.spacing.xxSmall,
    paddingRight: t.spacing.xxSmall,
    borderRadius: t.borderRadius.small,
    backgroundColor: t.color.system.base[100],
    color: tones(t, m).textMuted,
    fontSize: t.fontSize.xSmall,
  }))

/** The chip's remove button (labelled by the base's getRemoveProps). */
const TagRemove = el
  .config({ name: 'TagRemove' })
  .attrs({ tag: 'button' })
  .theme((t, m) => ({
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: tones(t, m).textMuted,
    cursor: 'pointer',
    fontSize: t.fontSize.xSmall,
    lineHeight: 1,
    padding: 0,
    hover: { color: t.color.system.error.base },
  }))

/** The free-text entry field — borderless, blends into the row. */
const TagField = el
  .config({ name: 'TagField' })
  .attrs({ tag: 'input', type: 'text' })
  .theme((t, m) => ({
    borderWidth: 0,
    outline: 'none',
    backgroundColor: 'transparent',
    fontSize: t.fontSize.small,
    color: tones(t, m).text,
    flexGrow: 1,
    minWidth: 80,
  }))

export interface TagsInputProps extends TagsInputBaseProps {
  /** Consumer render-prop ESCAPE HATCH — overrides the built-in markup. */
  children?: (state: TagsInputState) => VNodeChild
}

/**
 * Free-form tag entry — batteries-included: `<TagsInput defaultValue={['a']} />`
 * renders the chips row + input out of the box. Behavior from TagsInputBase
 * (Enter/comma commit, Backspace-on-empty removes, paste split, dedup/
 * validate/maxTags, localizable labels); structure from Element; visuals
 * from the theme.
 */
export const TagsInput: ComponentFn<TagsInputProps> = (props) => {
  const [own, rest] = splitProps(props, ['children'])

  if (typeof own.children === 'function') {
    return h(TagsInputBase as never, { ...rest, children: own.children })
  }

  return h(TagsInputBase as never, {
    ...rest,
    children: (s: TagsInputState) =>
      h(
        TagsRoot as never,
        s.rootProps(),
        // Chips are a WHOLE-LIST reactive accessor — tags change structurally
        // on commit/remove and chips carry no roving focus, so re-rendering
        // the list is the correct semantic (unlike Rating's static stars).
        () =>
          s
            .tags()
            .map((tag) =>
              h(
                TagChip as never,
                { 'data-tag': tag },
                tag,
                h(TagRemove as never, s.getRemoveProps(tag), '×'),
              ),
            ),
        h(TagField as never, s.inputProps()),
      ),
  })
}

export default TagsInput
