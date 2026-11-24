import { For } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { art } from '../theme'
import { asset, mediaUrl, type PictureData, pictureOf, posterOf, themePair } from './assets'
import { C } from './classes'
import { LoopPlayerIsland } from './islands'
import type { LoopSources } from './LoopPlayer'

/**
 * Images, loops and animated SVGs from the asset set, rendered on the server.
 * Every size comes from the manifest, so nothing shifts when a file loads.
 */

/**
 * `themed`: one of a dark/light pair, hidden by CSS in the other theme. Such a
 * picture is always `loading="lazy"`: a lazy image that is not displayed is
 * never fetched, while an eager one is, so an eager pair used to download BOTH
 * theme files at high priority (on the home page, the hero loop's two
 * posters, 33 KB on a phone where the hero visual is not even displayed). An
 * eager pair is made discoverable early by `preloadThemePair` instead.
 */
/** One theme's preload, as the inline script below inserts it. */
interface PosterPreload {
  readonly href: string
  readonly srcset?: string | undefined
  readonly type?: string | undefined
}

const posterPreload = (d: PictureData): PosterPreload => {
  const best = d.sources[0]
  return best ? { href: d.src, srcset: best.srcset, type: best.type } : { href: d.src }
}

/**
 * The inline script that preloads an eager theme pair: ONE `<link
 * rel="preload">`, for the theme the visitor will see. It runs in `<head>`
 * after the pre-paint script (`color-mode.ts`), which has already written
 * `data-theme` from the stored choice (`pyreon-theme`) or the OS preference,
 * so it picks the same file CSS will show. A declarative preload per
 * `prefers-color-scheme` got it wrong whenever the stored theme differs from
 * the OS: the hidden poster at high priority, the shown one late. `media`
 * limits it to where the visual is displayed (none on phones). Exported for
 * the unit test.
 */
export function posterPreloadScript(dark: PictureData, light: PictureData, sizes: string, visibleMedia: string | undefined): string {
  const data = JSON.stringify({ dark: posterPreload(dark), light: posterPreload(light), sizes, media: visibleMedia ?? '' }).replace(
    /</g,
    '\\u003c',
  )

  return (
    `(function(){var c=${data},d=document,p=c[d.documentElement.getAttribute("data-theme")==="light"?"light":"dark"],` +
    `l=d.createElement("link");l.rel="preload";l.as="image";l.href=p.href;` +
    `if(p.srcset){l.setAttribute("imagesrcset",p.srcset);l.setAttribute("imagesizes",c.sizes);l.type=p.type}` +
    `if(c.media)l.media=c.media;l.setAttribute("fetchpriority","high");d.head.appendChild(l)})()`
  )
}

function preloadThemePair(dark: PictureData, light: PictureData, sizes: string, visibleMedia: string | undefined): void {
  useHead({ script: [{ children: posterPreloadScript(dark, light, sizes, visibleMedia) }] })
}

function PictureTag(props: {
  data: PictureData
  alt: string
  eager?: boolean | undefined
  themed?: boolean | undefined
  sizes: string
  class?: string | undefined
}) {
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
        loading={props.eager && !props.themed ? 'eager' : 'lazy'}
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
  /** Where the picture is displayed at all (e.g. `(min-width: 700px)`); limits an eager pair's preload. */
  preloadMedia?: string | undefined
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
  if (props.eager) preloadThemePair(dark, light, sizes, props.preloadMedia)

  return (
    <>
      <PictureTag data={dark} alt={props.alt ?? dark.alt} eager={props.eager} themed sizes={sizes} class={`${C.onlyDark} ${props.class ?? ''}`} />
      <PictureTag data={light} alt={props.alt ?? light.alt} eager={props.eager} themed sizes={sizes} class={`${C.onlyLight} ${props.class ?? ''}`} />
    </>
  )
}

/**
 * The dark and light posters of an animated SVG, chart or video as one
 * theme-following picture pair. Used under a `Loop` and as the reduced-motion
 * or no-JS face of anything that moves.
 */
export function Poster(props: {
  file: string
  alt?: string | undefined
  eager?: boolean | undefined
  sizes?: string | undefined
  preloadMedia?: string | undefined
}) {
  const sizes = props.sizes ?? '(min-width: 1240px) 1240px, 100vw'
  const dark = posterOf(props.file, 'dark')
  const light = posterOf(props.file, 'light')
  if (props.eager) preloadThemePair(dark, light, sizes, props.preloadMedia)

  return (
    <>
      <PictureTag data={dark} alt={props.alt ?? dark.alt} eager={props.eager} themed sizes={sizes} class={C.onlyDark} />
      <PictureTag data={light} alt={props.alt ?? light.alt} eager={props.eager} themed sizes={sizes} class={C.onlyLight} />
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
export function Loop(props: {
  media: LoopMedia
  eager?: boolean | undefined
  sizes?: string | undefined
  /** Where the loop is displayed at all (e.g. `(min-width: 700px)`); limits an eager loop's poster preload. */
  preloadMedia?: string | undefined
}) {
  const m = props.media
  const darkPoster = pictureOf(m.dark.poster)
  const lightPoster = pictureOf(m.light.poster)
  const sizes = props.sizes ?? '(min-width: 1240px) 1240px, 100vw'
  if (props.eager) preloadThemePair(darkPoster, lightPoster, sizes, props.preloadMedia)

  return (
    <figure class={C.loop} style={`aspect-ratio:${m.width} / ${m.height}`}>
      <PictureTag data={darkPoster} alt={m.alt} eager={props.eager} themed sizes={sizes} class={C.onlyDark} />
      <PictureTag data={lightPoster} alt={m.alt} eager={props.eager} themed sizes={sizes} class={C.onlyLight} />
      <LoopPlayerIsland sources={toSources(m)} label={m.alt} width={m.width} height={m.height} />
    </figure>
  )
}

/** The width an asset-set SVG is drawn at (its `viewBox`), or undefined. */
function drawnWidth(markup: string): number | undefined {
  const m = /viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)/.exec(markup)
  return m ? Number(m[1]) : undefined
}

/** The SVG's own `<title>`, to name the box when it scrolls. */
function svgTitle(markup: string): string | undefined {
  const m = /<title[^>]*>([^<]+)<\/title>/.exec(markup)
  return m ? m[1]!.trim() : undefined
}

/**
 * Attributes for the box around inline SVG art: the narrowest the drawing
 * may get (`art` in theme.ts) as `--art-min`, and, because the box scrolls
 * sideways when the screen is narrower than that, a keyboard stop with the
 * drawing's title as its name. `decorative` art (aria-hidden, the figures are
 * printed beside it) gets no keyboard stop. Styled by `[data-art]` in
 * site-css.ts.
 */
export interface ArtBoxAttrs {
  'data-art': ''
  style: string
  tabIndex: number | undefined
  role: string | undefined
  'aria-label': string | undefined
}

export function artBox(markup: string, decorative = false): ArtBoxAttrs {
  const w = drawnWidth(markup)
  const min = w ? Math.min(Math.round(w * (decorative ? art.decorativeMinScale : art.minScale)), art.maxMinWidth) : 0
  return {
    'data-art': '',
    style: `--art-min:${min}px`,
    tabIndex: decorative ? undefined : 0,
    role: decorative ? undefined : 'region',
    'aria-label': decorative ? undefined : svgTitle(markup),
  }
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
export function AnimatedSvg(props: {
  file: string
  markup?: string | undefined
  src?: string | undefined
  alt?: string | undefined
  eager?: boolean | undefined
  /** The figures are printed beside it (the box is aria-hidden): no keyboard stop when it scrolls. */
  decorative?: boolean | undefined
}) {
  const a = asset(props.file)
  if (props.markup !== undefined) {
    return <div class={C.svgArt} {...artBox(props.markup, props.decorative)} dangerouslySetInnerHTML={{ __html: props.markup }} />
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
