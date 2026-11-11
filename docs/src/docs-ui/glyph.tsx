import { glyphHref } from '../site/nav'

/**
 * A product glyph from the shared sprite (`public/brand/glyphs.svg`), the
 * same symbols the marketing nav uses. The docs draw it with this one
 * element instead of the kit's `Glyph`, so a docs page does not load the kit
 * card module for an icon.
 */
export function DocsGlyph(props: { id: string; size: number }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 120 120" aria-hidden="true" class="dx-glyph">
      <use href={glyphHref(props.id)} />
    </svg>
  )
}
