import { For } from '@pyreon/core'
import { asset, mediaUrl, type PictureData, pictureOf, posterOf, themePair } from './assets'
import { C } from './classes'
import { LoopPlayerIsland } from './islands'
import type { LoopSources } from './LoopPlayer'

/**
 * Images, loops and animated SVGs from the asset set, rendered on the server.
 * Every size comes from the manifest, so nothing shifts when a file loads.
 */

function PictureTag(props: { data: PictureData; alt: string; eager?: boolean | undefined; sizes: string; class?: string | undefined }) {
  const d = props.data
  return (
    <picture class={props.class ? `${C.picture} ${props.class}` : C.picture}>
      <For each={d.sources} by={(s) => s.type}>
        {(s) => <source type={s.type} srcSet={s.srcset} sizes={props.sizes} />}
      </For>
      <img
        src={d.src}
        alt={props.alt}
        width={d.width}
        height={d.height}
        loading={props.eager ? 'eager' : 'lazy'}
        fetchPriority={props.eager ? 'high' : undefined}
        decoding={props.eager ? 'sync' : 'async'}
      />
    </picture>
  )
}

/**
 * A raster image as `<picture>`: AVIF and WebP `srcset` with every width
 * variant, `width`/`height` from the manifest, the manifest's alt text,
 * `loading="lazy"` unless `eager` (the hero: also `fetchpriority="high"`).
 *
 * A theme-split image (a real capture with `-dark` / `-light` files) renders
 * both pictures and CSS shows the one for the current theme; the hidden one
 * is never fetched because a lazy image that is not displayed does not load.
 * `alt=""` marks an image as decorative. `sizes` defaults to full width up to
 * the 1240px column.
 */
export function Picture(props: {
  file: string
  alt?: string | undefined
  eager?: boolean | undefined
  sizes?: string | undefined
  class?: string | undefined
}) {
  const pair = themePair(props.file)
  const sizes = props.sizes ?? '(min-width: 1240px) 1240px, 100vw'
  if (pair.dark === pair.light) {
    const data = pictureOf(props.file)
    return <PictureTag data={data} alt={props.alt ?? data.alt} eager={props.eager} sizes={sizes} class={props.class} />
  }
  const dark = pictureOf(pair.dark)
  const light = pictureOf(pair.light)
  return (
    <>
      <PictureTag data={dark} alt={props.alt ?? dark.alt} eager={props.eager} sizes={sizes} class={`${C.onlyDark} ${props.class ?? ''}`} />
      <PictureTag data={light} alt={props.alt ?? light.alt} eager={props.eager} sizes={sizes} class={`${C.onlyLight} ${props.class ?? ''}`} />
    </>
  )
}

/**
 * The dark and light posters of an animated SVG, chart or video as one
 * theme-following picture pair. Used under a `Loop` and as the reduced-motion
 * or no-JS face of anything that moves.
 */
export function Poster(props: { file: string; alt?: string | undefined; eager?: boolean | undefined; sizes?: string | undefined }) {
  const sizes = props.sizes ?? '(min-width: 1240px) 1240px, 100vw'
  const dark = posterOf(props.file, 'dark')
  const light = posterOf(props.file, 'light')
  return (
    <>
      <PictureTag data={dark} alt={props.alt ?? dark.alt} eager={props.eager} sizes={sizes} class={C.onlyDark} />
      <PictureTag data={light} alt={props.alt ?? light.alt} eager={props.eager} sizes={sizes} class={C.onlyLight} />
    </>
  )
}

/** The video files of a loop, by theme and size, from the content's `media` block. */
export interface LoopMedia {
  readonly dark: { readonly mp4: string; readonly webm: string; readonly poster: string; readonly small?: { readonly mp4: string; readonly webm: string } | undefined }
  readonly light: { readonly mp4: string; readonly webm: string; readonly poster: string; readonly small?: { readonly mp4: string; readonly webm: string } | undefined }
  readonly width: number
  readonly height: number
  readonly alt: string
}

const toSources = (m: LoopMedia): LoopSources => {
  const side = (s: LoopMedia['dark']) => ({
    webm: mediaUrl(s.webm),
    mp4: mediaUrl(s.mp4),
    smallWebm: s.small ? mediaUrl(s.small.webm) : undefined,
    smallMp4: s.small ? mediaUrl(s.small.mp4) : undefined,
  })
  return { dark: side(m.dark), light: side(m.light) }
}

/**
 * A silent video loop (the three-platform capture). The server renders the
 * dark and light posters (`<picture>`, theme-following, the reduced-motion
 * and no-JS face); a small island (`LoopPlayer`) loads the video only when it
 * nears the viewport, picks the file for the theme and the screen (`-sm`
 * below 700px), plays it muted and looped, pauses it off-screen and under
 * `prefers-reduced-motion`, swaps it when the theme changes, and offers a
 * pause button (WCAG 2.2.2: the loop runs longer than five seconds).
 */
export function Loop(props: { media: LoopMedia; eager?: boolean | undefined; sizes?: string | undefined }) {
  const m = props.media
  const darkPoster = pictureOf(m.dark.poster)
  const lightPoster = pictureOf(m.light.poster)
  const sizes = props.sizes ?? '(min-width: 1240px) 1240px, 100vw'
  return (
    <figure class={C.loop} style={`aspect-ratio:${m.width} / ${m.height}`}>
      <PictureTag data={darkPoster} alt={m.alt} eager={props.eager} sizes={sizes} class={C.onlyDark} />
      <PictureTag data={lightPoster} alt={m.alt} eager={props.eager} sizes={sizes} class={C.onlyLight} />
      <LoopPlayerIsland sources={toSources(m)} label={m.alt} width={m.width} height={m.height} />
    </figure>
  )
}

/**
 * An animated or theme-aware SVG from the asset set.
 *
 * - `markup` (the file imported with `?raw` from `src/site/media/…`): inlined,
 *   so the site's theme toggle reaches its CSS variables. The file carries its
 *   own `<title>`, `<desc>` and `role="img"`, and its own reduced-motion
 *   static state. Trusted build-time content from the asset set.
 * - `src` (the file imported with `?url`): an `<img>` with the manifest's
 *   size and alt text, lazy. It can only follow the OS colour scheme.
 *
 * Animations play on load (the hero once, others a calm loop); none needs
 * JavaScript.
 */
export function AnimatedSvg(props: { file: string; markup?: string | undefined; src?: string | undefined; alt?: string | undefined; eager?: boolean | undefined }) {
  const a = asset(props.file)
  if (props.markup !== undefined) {
    return <div class={C.svgArt} dangerouslySetInnerHTML={{ __html: props.markup }} />
  }
  return (
    <img
      class={C.svgArt}
      src={props.src ?? ''}
      alt={props.alt ?? a.alt}
      width={Math.round(a.width ?? 0)}
      height={Math.round(a.height ?? 0)}
      loading={props.eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
