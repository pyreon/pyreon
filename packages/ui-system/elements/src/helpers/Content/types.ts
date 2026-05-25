import type { HTMLTags } from '@pyreon/ui-core'
import type {
  AlignX,
  AlignY,
  Content,
  ContentAlignX,
  ContentAlignY,
  ContentBoolean,
  ContentDirection,
  ContentSimpleValue,
  Css,
  Direction,
  ExtendCss,
  Responsive,
  ResponsiveBoolType,
} from '../../types'

export interface Props {
  parentDirection: Direction | undefined
  gap: Responsive | undefined
  contentType: 'before' | 'content' | 'after' | undefined
  children: Content
  tag: HTMLTags | undefined
  direction: Direction | undefined
  alignX: AlignX | undefined
  alignY: AlignY | undefined
  equalCols: ResponsiveBoolType | undefined
  extendCss: ExtendCss | undefined
}

export interface StyledProps {
  $element: Pick<
    Props,
    'contentType' | 'parentDirection' | 'direction' | 'alignX' | 'alignY' | 'equalCols' | 'gap'
  > & {
    extraStyles: Props['extendCss']
  }
  $contentType: Props['contentType']
}

// All fields optional — at the styles-callback boundary the responsive
// engine passes per-breakpoint resolved scalars, and the Content component
// forwards `own.X` props which are all `<X> | undefined`. The callback
// body already guards each key with truthy / `&&` checks.
export type ThemeProps = Partial<{
  contentType: Props['contentType']
  parentDirection: ContentDirection
  direction: ContentDirection
  alignX: ContentAlignX
  alignY: ContentAlignY
  equalCols: ContentBoolean
  gap: ContentSimpleValue
  extraStyles: Css
}>
