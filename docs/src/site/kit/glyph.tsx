import { glyphHref } from '../nav'

/**
 * Product glyph. Either `id` (from the shared sprite, `public/brand/glyphs.svg`)
 * or `svg` (inner markup for a 120×120 viewBox from content JSON; `url(#eg)`
 * needs `<EmberGradientDefs />` once on the page). Decorative: aria-hidden.
 *
 * Plain markup with no styling runtime, so islands (the nav) can use it.
 */
export function Glyph(props: { id?: string | undefined; svg?: string | undefined; size: number }) {
  if (props.svg !== undefined) {
    // Repo-owned build-time content (content/products/*.json), never user input.
    return <svg width={props.size} height={props.size} viewBox="0 0 120 120" aria-hidden="true" dangerouslySetInnerHTML={{ __html: props.svg }} />
  }
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 120 120" aria-hidden="true">
      <use href={glyphHref(props.id ?? 'pyreon')} />
    </svg>
  )
}
