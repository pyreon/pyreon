import { For } from '@pyreon/core'
import type { HeroVisual, PictureSource, ThemedPicture as ThemedPictureData } from '../content/visuals'
import { font, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { Loop, Picture } from '../kit/media'

/**
 * The product page's hero visual (inline animated SVG, a capture through the
 * kit's `Picture`, or the three-targets `Loop`), and `ThemedPicture` for the
 * demo islands, which receive resolved picture data as props (an island never
 * imports the asset manifest).
 *
 * - SVGs from the asset set are inlined (their colours are CSS variables that
 *   follow `<html data-theme>`), as trusted static markup from the synced
 *   JSON. Hydration adopts the server DOM of `dangerouslySetInnerHTML`.
 * - Theme pairs render both `<picture>`s and hide one with CSS: a
 *   `display: none` lazy image is never fetched.
 */

const SvgBox = el
  .config({ name: 'InlineSvg' })
  .attrs({ block: true })
  .theme(() => ({ extendCss: '& > div { width: 100%; } & svg { display: block; width: 100%; height: auto; }' }))

/** An animated SVG from the asset set, inlined. It carries its own `<title>`/`<desc>` and `role="img"`. */
export function InlineSvg(props: { svg: string }) {
  return (
    <SvgBox>
      <div dangerouslySetInnerHTML={{ __html: props.svg }} />
    </SvgBox>
  )
}

const ThemedBox = el
  .config({ name: 'ThemedPicture' })
  .attrs({ block: true })
  .theme(() => ({
    extendCss: `
      & img { display: block; width: 100%; height: auto; }
      [data-theme='light'] & > [data-for='dark'], [data-theme='dark'] & > [data-for='light'] { display: none; }
    `,
  }))

function Pic(props: { source: PictureSource; alt: string; sizes: string; lazy: boolean; theme: 'dark' | 'light' }) {
  return (
    <picture data-for={props.theme}>
      <source type="image/avif" srcSet={props.source.avif} sizes={props.sizes} />
      <source type="image/webp" srcSet={props.source.webp} sizes={props.sizes} />
      <img
        src={props.source.src}
        alt={props.alt}
        width={props.source.width}
        height={props.source.height}
        loading={props.lazy ? 'lazy' : 'eager'}
        decoding="async"
      />
    </picture>
  )
}

/** A real capture in both themes; only the one for the current theme is fetched. */
export function ThemedPicture(props: { data: ThemedPictureData; sizes: string; lazy?: boolean | undefined }) {
  // Before hydration the theme is on <html> already (pre-paint script), so
  // the hidden variant is display:none from the first paint.
  return (
    <ThemedBox>
      <Pic source={props.data.dark} alt={props.data.alt} sizes={props.sizes} lazy={props.lazy ?? true} theme="dark" />
      <Pic source={props.data.light} alt={props.data.alt} sizes={props.sizes} lazy={props.lazy ?? true} theme="light" />
    </ThemedBox>
  )
}

const Labels = el
  .config({ name: 'LoopLabels' })
  .attrs({ tag: 'ol', block: true })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
    listStyle: 'none',
    margin: 0,
    marginTop: 10,
    padding: 0,
  }))

const Label = txt
  .config({ name: 'LoopLabel' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size - 1, lineHeight: 1.4, color: tone(m, 'fog'), textAlign: 'center' }))

const Frame = el
  .config({ name: 'ProductHeroVisual' })
  .attrs({ tag: 'figure', block: true })
  .theme((_t, m) => ({
    position: 'relative',
    margin: 0,
    marginTop: { xs: 40, lg: 56 },
    marginLeft: 'auto',
    marginRight: 'auto',
    maxWidth: 860,
    padding: { xs: 10, sm: 14 },
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.demo,
    backgroundColor: tone(m, 'card'),
    boxShadow: tone(m, 'cardShadow'),
    overflow: 'hidden',
  }))

/** The product's hero visual under the hero text: animated SVG, capture pair or loop. */
export function HeroVisualFigure(props: { visual: HeroVisual }) {
  const v = props.visual
  return (
    <Frame>
      {v.kind === 'svg' ? (
        <InlineSvg svg={v.svg} />
      ) : v.kind === 'picture' ? (
        <Picture file={v.file} alt={v.alt} eager sizes="(min-width: 1100px) 840px, calc(100vw - 60px)" />
      ) : (
        <>
          <Loop media={v.media} sizes="(min-width: 1100px) 840px, calc(100vw - 60px)" />
          <Labels>
            <For each={v.labels} by={(l) => l}>
              {(l) => <Label>{l}</Label>}
            </For>
          </Labels>
        </>
      )}
    </Frame>
  )
}
