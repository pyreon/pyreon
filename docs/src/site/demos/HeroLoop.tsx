import { For, onMount, Show } from '@pyreon/core'
import { useMediaQuery, useReducedMotion } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { colorMode } from '../color-mode'
import type { HeroVisual, LoopSide } from '../content/visuals'
import { font, text } from '../theme'
import { el, tone, txt } from '../kit/bases'

type Loop = Extract<HeroVisual, { kind: 'loop' }>

const Media = el
  .config({ name: 'LoopMedia' })
  .attrs({ block: true })
  .theme(() => ({
    extendCss: `
      position: relative;
      & video, & img { display: block; width: 100%; height: auto; }
      & > video { position: absolute; inset: 0; height: 100%; object-fit: cover; }
      [data-theme='light'] & > [data-for='dark'], [data-theme='dark'] & > [data-for='light'] { display: none; }
    `,
  }))

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

const SIZES = '(min-width: 1100px) 1012px, calc(100vw - 60px)'

/** The poster files are `<name>-640.<ext>` (640 wide) and `<name>.<ext>` (full width). */
const srcset = (files: readonly string[], full: number): string =>
  files.map((f) => `${f} ${/-640\.[a-z]+$/.test(f) ? 640 : full}w`).join(', ')

function Poster(props: { side: LoopSide; theme: 'dark' | 'light'; alt: string; width: number; height: number }) {
  return (
    <picture data-for={props.theme}>
      <source type="image/avif" srcSet={srcset(props.side.poster.avif, props.width)} sizes={SIZES} />
      <source type="image/webp" srcSet={srcset(props.side.poster.webp, props.width)} sizes={SIZES} />
      <img src={props.side.poster.src} alt={props.alt} width={props.width} height={props.height} loading="lazy" decoding="async" />
    </picture>
  )
}

/**
 * The three-targets loop (Native's hero visual): one source file running on
 * the web, iOS and Android. The server HTML is the poster for each theme; on
 * the client the video for the current theme and width replaces it, unless
 * the visitor prefers reduced motion (then the poster stays, as the manifest
 * asks). Silent, muted, looping, `playsinline`, `preload="metadata"`.
 */
export default function HeroLoop(props: { loop: Loop }) {
  const reduced = useReducedMotion()
  // The first client render matches the server (posters); the video replaces
  // them after mount, so hydration adopts the server DOM.
  const play = signal(false)
  onMount(() => {
    if (!reduced()) play.set(true)
  })
  const small = useMediaQuery('(max-width: 699px)')
  const side = () => {
    const s = props.loop[colorMode()]
    return small() ? s.small : s.large
  }
  return (
    <div>
      <Media>
        {/* The posters stay in the DOM (the server HTML is adopted as is); the
            video is laid over them once it may play. */}
        <Poster side={props.loop.dark.large} theme="dark" alt={props.loop.alt} width={props.loop.width} height={props.loop.height} />
        <Poster side={props.loop.light.large} theme="light" alt={props.loop.alt} width={props.loop.width} height={props.loop.height} />
        <Show when={() => play() && !reduced()}>
          {() => {
            const s = side()
            return (
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster={s.poster.src}
                aria-hidden="true"
                width={small() ? props.loop.smallWidth : props.loop.width}
                height={small() ? props.loop.smallHeight : props.loop.height}
              >
                <source src={s.webm} type="video/webm" />
                <source src={s.mp4} type="video/mp4" />
              </video>
            )
          }}
        </Show>
      </Media>
      <Labels>
        <For each={props.loop.labels} by={(l) => l}>
          {(l) => <Label>{l}</Label>}
        </For>
      </Labels>
    </div>
  )
}
