import { onMount, onUnmount } from '@pyreon/core'
import { signal, watch } from '@pyreon/reactivity'
import { colorMode } from '../color-mode'
import { C } from './classes'

export interface LoopFiles {
  readonly webm: string
  readonly mp4: string
  readonly smallWebm?: string | undefined
  readonly smallMp4?: string | undefined
}
export interface LoopSources {
  readonly dark: LoopFiles
  readonly light: LoopFiles
}

/** Below this width the phone-sized files play (`-sm`, 720px wide). */
const SMALL = '(max-width: 699.98px)'
const REDUCED = '(prefers-reduced-motion: reduce)'

/** The files for a theme and screen: WebM first, MP4 second. Exported for the unit test. */
export function pickLoopFiles(sources: LoopSources, mode: 'dark' | 'light', small: boolean): { webm: string; mp4: string } {
  const f = sources[mode]
  return small && f.smallWebm && f.smallMp4 ? { webm: f.smallWebm, mp4: f.smallMp4 } : { webm: f.webm, mp4: f.mp4 }
}

/**
 * The video of a `Loop` (an island; the posters around it are server HTML).
 *
 * Nothing loads until the loop nears the viewport (`preload="none"`, no
 * source in the server HTML). Then: muted, looped, inline; the file follows
 * the theme and the screen width; the video fades in over the poster once it
 * plays; it pauses off-screen; under reduced motion it never starts (the
 * poster stays); the button pauses and resumes it.
 */
export default function LoopPlayer(props: { sources: LoopSources; label: string; width: number; height: number }) {
  const playing = signal(false)
  const userPaused = signal(false)
  const visible = signal(false)
  let video: HTMLVideoElement | null = null
  let box: HTMLElement | null = null
  let loaded = ''

  const load = () => {
    if (!video) return
    const files = pickLoopFiles(props.sources, colorMode(), matchMedia(SMALL).matches)
    const key = `${files.webm}|${files.mp4}`
    if (key === loaded) return
    loaded = key
    const canWebm = video.canPlayType('video/webm; codecs="vp9"') !== ''
    video.src = canWebm ? files.webm : files.mp4
    video.load()
  }

  const sync = () => {
    if (!video) return
    if (visible() && !userPaused()) {
      load()
      void video.play().catch(() => playing.set(false))
    } else if (!video.paused) {
      video.pause()
    }
  }

  onMount(() => {
    box = video?.parentElement ?? null
    // Reduced motion: the loop starts paused (the poster stays); the button
    // still plays it for a visitor who asks.
    if (matchMedia(REDUCED).matches) userPaused.set(true)
    const onPlaying = () => playing.set(true)
    const onPause = () => playing.set(false)
    video?.addEventListener('playing', onPlaying)
    video?.addEventListener('pause', onPause)
    const io = new IntersectionObserver((entries) => visible.set(entries.some((e) => e.isIntersecting)), { rootMargin: '200px 0px' })
    if (video) io.observe(video)
    const mq = matchMedia(SMALL)
    const onSize = () => {
      loaded = ''
      if (visible()) sync()
    }
    mq.addEventListener('change', onSize)
    return () => {
      io.disconnect()
      mq.removeEventListener('change', onSize)
      video?.removeEventListener('playing', onPlaying)
      video?.removeEventListener('pause', onPause)
    }
  })
  // Theme switch: the other file, from the same point in the loop.
  watch(colorMode, () => {
    if (!video || loaded === '') return
    const t = video.currentTime
    load()
    video.currentTime = t
    sync()
  })
  watch(() => [visible(), userPaused()] as const, sync)
  watch(playing, (on) => {
    box?.classList.toggle(C.loopPlaying, on)
  })
  onUnmount(() => video?.pause())

  return (
    <>
      <video
        class={C.loopVideo}
        ref={(el: HTMLVideoElement | null) => {
          video = el
        }}
        width={props.width}
        height={props.height}
        aria-label={props.label}
        muted
        loop
        playsInline
        preload="none"
      />
      <button
        type="button"
        class={C.loopToggle}
        aria-label="Pause the video"
        aria-pressed={() => (userPaused() ? 'true' : 'false')}
        onClick={() => userPaused.set(!userPaused.peek())}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d={() => (userPaused() ? 'M3 1.5v9l7.5-4.5z' : 'M3 1.5h2v9H3zM7 1.5h2v9H7z')} fill="currentColor" />
        </svg>
      </button>
    </>
  )
}
