// Web implementation of `<Video>` — video playback.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { VideoProps } from '../types/content'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

function resolveDimension(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value
}

/**
 * `<Video>` — video playback. `src` required.
 *
 * Compiles to:
 * - Web (this impl): `<video src … playsinline>` with the status events
 *   mapped onto `onStatusChange` (`playing` → 'playing', `pause` →
 *   'paused', `waiting` → 'waiting').
 * - iOS (via PMTC): `PyreonVideoPlayer(url:)` — AVKit `VideoPlayer`.
 * - Android (via PMTC): `PyreonVideoPlayer(url = …)` — Media3 ExoPlayer.
 *
 * Same src dispatch as `<Image>`: a bare name is a bundled asset
 * (`/assets/` on web); scheme'd URLs and path-style srcs pass through.
 * `playsinline` is always set — inline playback is the cross-platform
 * baseline, and iOS Safari fullscreens without it.
 */
export const Video = (props: VideoProps): VNode => {
  const style: Record<string, string> = {}
  if (props.width !== undefined) style.width = resolveDimension(props.width)
  if (props.height !== undefined) style.height = resolveDimension(props.height)
  const src =
    /^https?:\/\//.test(props.src) || props.src.includes('/')
      ? props.src
      : `/assets/${props.src}`
  const notify = (status: 'waiting' | 'playing' | 'paused') => () =>
    props.onStatusChange?.(status)
  return h('video', {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    src,
    autoplay: props.autoPlay ?? false,
    loop: props.loop ?? false,
    muted: props.muted ?? false,
    controls: props.controls ?? true,
    playsinline: true,
    onPlaying: notify('playing'),
    onPause: notify('paused'),
    onWaiting: notify('waiting'),
    style: mergePassthroughStyle(style, props.style),
  })
}
