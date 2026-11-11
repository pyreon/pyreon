import { island } from '@pyreon/zero'
import type { HeroVisual, PictureSource, ThemedPicture as ThemedPictureData } from '../content/visuals'
import { radius } from '../theme'
import { el, tone } from '../kit/bases'

/**
 * Asset helpers for the products-a slice: an inline animated SVG, a capture
 * that exists once per theme, and the three-targets loop. The home slice is
 * building the kit's shared `Picture` / `Loop` / `AnimatedSvg`; when they
 * land, this file is the one place to switch over.
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

/** The three-targets loop: poster in the HTML, the video attached on the client (not under reduced motion). */
export const HeroLoop = island(() => import('./HeroLoop'), { name: 'HeroLoop', hydrate: 'visible' })

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
      ) : v.kind === 'pair' ? (
        <ThemedPicture data={v} sizes="(min-width: 1100px) 1012px, calc(100vw - 60px)" lazy={false} />
      ) : (
        <HeroLoop loop={v} />
      )}
    </Frame>
  )
}
