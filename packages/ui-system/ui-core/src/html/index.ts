import type { HTMLElementAttrs } from './htmlElementAttrs'
import type { HTMLTags, HTMLTextTags } from './htmlTags'
import { HTML_TAGS, HTML_TEXT_TAGS } from './htmlTags'

type HTMLTagAttrsByTag<T extends HTMLTags> = T extends HTMLTags
  ? HTMLElementAttrs[T]
  : Record<string, never>

export type { HTMLElementAttrs, HTMLTagAttrsByTag, HTMLTags, HTMLTextTags }

export { HTML_TAGS, HTML_TEXT_TAGS }
