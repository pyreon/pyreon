import type { ComponentFn, PyreonHTMLAttributes } from '@pyreon/core'
import type { HTMLTags } from '@pyreon/ui-core'
import type {
  AlignX,
  AlignY,
  Content,
  Direction,
  ExtendCss,
  InnerRef,
  PyreonStatic,
  Responsive,
  ResponsiveBoolType,
} from '../types'

export type Props = Partial<{
  /**
   * Valid HTML Tag
   */
  tag: HTMLTags

  /**
   * Ref prop, alternative to `ref`
   */
  innerRef: InnerRef

  /**
   * Valid `children`
   */
  children: Content

  /**
   * Alternative prop to `children`
   * It is recommended to pass only one of `children`, `content` or `label` props
   *
   * The prioritization of rendering is following: `children` → `content` → `label`
   */
  content: Content

  /**
   * Alternative prop to `children`
   * It is recommended to pass only one of `children`, `content` or `label` props
   *
   * The prioritization of rendering is following: `children` → `content` → `label`
   */
  label: Content

  /**
   * Valid `children` to be rendered inside _beforeContent_ wrapper
   */
  beforeContent: Content

  /**
   * Valid `children` to be rendered inside _afterContent_ wrapper
   */
  afterContent: Content

  /**
   * A boolean type to define whether **Element** should behave
   * as an inline or block element (`flex` vs. `inline-flex`)
   */
  block: ResponsiveBoolType

  /**
   * A boolean type to define whether inner wrappers should be equal
   * (have the same width or height)
   */
  equalCols: ResponsiveBoolType

  /**
   * When true, measures the `beforeContent` and `afterContent` slot wrappers
   * after render and sets both to the larger dimension so they match.
   */
  equalBeforeAfter: boolean

  /**
   * Defines a `gap` spacing between inner wrappers
   */
  gap: Responsive

  /**
   * Defines direction of inner wrappers
   */
  direction: Direction

  /**
   * Defines flow of `children` elements within its inner wrapper.
   */
  contentDirection: Direction

  /**
   * Defines flow of `beforeContent` elements within its inner wrapper.
   */
  beforeContentDirection: Direction

  /**
   * Defines flow of `afterContent` elements within its inner wrapper.
   */
  afterContentDirection: Direction

  /**
   * Define alignment horizontally.
   */
  alignX: AlignX

  /**
   * Defines how `content` children are aligned horizontally.
   */
  contentAlignX: AlignX

  /**
   * Defines how `beforeContent` children are aligned horizontally.
   */
  beforeContentAlignX: AlignX

  /**
   * Defines how `afterContent` children are aligned horizontally.
   */
  afterContentAlignX: AlignX

  /**
   * Define alignment vertically.
   */
  alignY: AlignY

  /**
   * Defines how `content` children are aligned vertically.
   */
  contentAlignY: AlignY

  /**
   * Defines how `beforeContent` children are aligned vertically.
   */
  beforeContentAlignY: AlignY

  /**
   * Defines how `afterContent` children are aligned vertically.
   */
  afterContentAlignY: AlignY

  /**
   * `dangerouslySetInnerHTML` prop
   */
  dangerouslySetInnerHTML: { __html: string }

  /**
   * An additional prop for extending styling of the **root** wrapper element
   */
  css: ExtendCss

  /**
   * An additional prop for extending styling of the **content** wrapper element.
   */
  contentCss: ExtendCss

  /**
   * An additional prop for extending styling of the **beforeContent** wrapper element.
   */
  beforeContentCss: ExtendCss

  /**
   * An additional prop for extending styling of the **afterContent** wrapper element.
   */
  afterContentCss: ExtendCss
}> &
  PyreonHTMLAttributes

export type PyreonElement<P extends Record<string, unknown> = {}> = ComponentFn<Props & P> &
  PyreonStatic
