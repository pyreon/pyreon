// Web implementation of `<Audio>` — sound playback.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import type { AudioProps } from '../types/content'
import { collectPassthroughAttrs, mergePassthroughStyle } from './passthrough'

/**
 * `<Audio>` — sound playback. `src` required.
 *
 * Compiles to:
 * - Web (this impl): `<audio src>` with the status events mapped onto
 *   `onStatusChange` (`playing` → 'playing', `pause` → 'paused', `waiting` →
 *   'waiting') — the same mapping `<Video>` uses.
 * - iOS (via PMTC): `PyreonAudioPlayer(url:)` — AVFoundation.
 * - Android (via PMTC): `PyreonAudioPlayer(url = …)` — Media3.
 *
 * Same src dispatch as `<Image>` and `<Video>`: a bare name is a bundled
 * asset (`/assets/` on web); scheme'd URLs and path-style srcs pass through.
 *
 * NON-VISUAL by design — see AudioProps for why there is no `controls`.
 */
export const Audio = (props: AudioProps): VNode => {
  const src =
    /^https?:\/\//.test(props.src) || props.src.includes('/')
      ? props.src
      : `/assets/${props.src}`
  const notify = (status: 'waiting' | 'playing' | 'paused') => () =>
    props.onStatusChange?.(status)
  // Clamp rather than throw: a volume outside 0..1 is a caller slip, and
  // refusing to play is a worse answer than playing at the nearest legal
  // level. The native runtimes clamp identically.
  const volume =
    props.volume === undefined ? undefined : Math.min(1, Math.max(0, props.volume))
  return h('audio', {
    ...collectPassthroughAttrs(props as unknown as Record<string, unknown>),
    src,
    autoplay: props.autoPlay ?? false,
    loop: props.loop ?? false,
    muted: props.muted ?? false,
    ...(volume === undefined ? {} : { volume }),
    onPlaying: notify('playing'),
    onPause: notify('paused'),
    onWaiting: notify('waiting'),
    style: mergePassthroughStyle({}, props.style),
  })
}
