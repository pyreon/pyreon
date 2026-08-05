// `<Video>` canonical primitive emit — the Media row's AV half, which had no
// vocabulary at all. Web `<video>`; iOS `PyreonVideoPlayer(url:)` (AVKit
// VideoPlayer over AVPlayer, timeControlStatus → onStatusChange); Android
// `PyreonVideoPlayer(url = …)` (Media3 ExoPlayer in an AndroidView).
//
// The `onStatusChange` three-value vocabulary (`waiting`/`playing`/`paused`)
// is the cross-target contract: the same handler observes web media events,
// the AVPlayer KVO, and the ExoPlayer listener — and the status TEXT it
// drives is the device-test assertion surface (playback state is provable;
// rendered video frames are not: video draws on a surface layer neither
// harness can capture — disclosed in the matrix).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
import { Stack, Text, Video } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function VideoPage() {
  const vstatus = signal<string>('waiting')
  return (
    <Stack gap={3}>
      <Video src="http://127.0.0.1:8787/clip.mp4" autoPlay muted onStatusChange={(s) => vstatus.set(s)} height={200} data-testid="video-player" />
      <Text data-testid="video-status">Video: {vstatus()}</Text>
    </Stack>
  )
}
`

describe('<Video> primitive emit', () => {
  it('Swift: lowers to PyreonVideoPlayer with url/flags/handler + frame + testid', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      'PyreonVideoPlayer(url: URL(string: "http://127.0.0.1:8787/clip.mp4"), autoPlay: true, muted: true, onStatusChange: { s in vstatus = s })',
    )
    expect(r.code).toContain('.frame(height: 200)')
    // The generic modifier tail must survive the special-case emitter — a
    // dropped identifier makes the element structurally unassertable (the
    // <Link>/<Toggle> class).
    expect(r.code).toContain('.accessibilityIdentifier("video-player")')
  })

  it('Kotlin: lowers to PyreonVideoPlayer with the message-handler closure + testTag', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonVideoPlayer(url = "http://127.0.0.1:8787/clip.mp4"')
    expect(r.code).toContain('onStatusChange = { s -> vstatus = s }')
    expect(r.code).toContain('Modifier.testTag("video-player")')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: video emit type-checks against the stub', () => {
    const out = transform(SRC, { target: 'swift' }).code
    const res = validateSwiftWithStubs(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: video emit compiles on kotlinc', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
