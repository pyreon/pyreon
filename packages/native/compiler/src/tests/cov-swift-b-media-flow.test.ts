// Branch-coverage matrices for the Swift media elements (`<Video>` /
// `<Audio>` / `<Image>`), the flow primitives (`<For>` / `<Show>`), and
// `<Transition>`'s symmetric-vs-asymmetric split.
//
// The media elements bake their booleans at COMPILE time, so each carries a
// `bakedPropDynamicWarning` guard — a static value bakes, a dynamic one is a
// named loss. Both halves of every one of those guards are asserted here,
// because the silent half (a dynamic prop that bakes nothing and says nothing)
// is exactly the class the guard exists to close.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function tx(jsxBody: string): { code: string; warnings: string[] } {
  return transform(
    `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal<boolean>(true)
  const rows = signal<{ id: string; label: string }[]>([])
  const names = signal<string[]>([])
  const url = signal<string>('/a.mp4')
  const fn = (s: string) => {}
  return (${jsxBody})
}`,
    { target: 'swift' },
  )
}

describe('<Video> — static bakes, dynamic warns', () => {
  it('a STATIC src plus every static boolean bakes each argument', () => {
    const { code, warnings } = tx(
      `<Video src="/v.mp4" autoPlay={true} loop={true} muted={true} controls={false} />`,
    )
    expect(code).toContain('PyreonVideoPlayer(url: URL(string: "/v.mp4")')
    expect(code).toContain('autoPlay: true')
    expect(code).toContain('loop: true')
    expect(code).toContain('muted: true')
    // `controls` is the one that DEFAULTS TO TRUE — emitted only when false.
    expect(code).toContain('controls: false')
    expect(warnings.filter((w) => w.includes('Video'))).toHaveLength(0)
  })

  it('controls={true} is the default and emits NOTHING', () => {
    expect(tx(`<Video src="/v.mp4" controls={true} />`).code).not.toContain('controls:')
  })

  it('a DYNAMIC src bails to the generic emit', () => {
    const { code } = tx(`<Video src={url()} />`)
    expect(code).not.toContain('PyreonVideoPlayer')
  })

  it('each DYNAMIC boolean is a named loss', () => {
    for (const p of ['autoPlay', 'loop', 'muted', 'controls']) {
      const { warnings } = tx(`<Video src="/v.mp4" ${p}={on()} />`)
      expect(warnings.some((w) => w.includes(p)), p).toBe(true)
    }
  })

  it('width / height add a .frame; neither adds none', () => {
    expect(tx(`<Video src="/v.mp4" width={320} />`).code).toContain('.frame(width: 320')
    expect(tx(`<Video src="/v.mp4" height={180} />`).code).toContain('height: 180')
    expect(tx(`<Video src="/v.mp4" />`).code).not.toContain('.frame(')
  })

  it('onStatusChange with a PARAM binds it; without one binds `_`', () => {
    expect(tx(`<Video src="/v.mp4" onStatusChange={(s) => fn(s)} />`).code).toContain(
      'onStatusChange: { s in',
    )
    expect(tx(`<Video src="/v.mp4" onStatusChange={() => fn('x')} />`).code).toContain(
      'onStatusChange: { _ in',
    )
  })
})

describe('<Audio> — the same bake/warn split, with no frame', () => {
  it('static booleans bake; volume is CLAMPED at emit time', () => {
    const { code } = tx(
      `<Audio src="/a.mp3" autoPlay={true} loop={true} muted={true} volume={0.5} />`,
    )
    expect(code).toContain('PyreonAudioPlayer(url: URL(string: "/a.mp3")')
    expect(code).toContain('autoPlay: true')
    expect(code).toContain('loop: true')
    expect(code).toContain('muted: true')
    expect(code).toContain('volume: 0.5')
    expect(code).toContain('engine: AVFoundationAudioEngine()')
  })

  it('an ABOVE-RANGE literal volume is clamped at emit time', () => {
    expect(tx(`<Audio src="/a.mp3" volume={9} />`).code).toContain('volume: 1')
  })

  it('a NEGATIVE literal volume is a unary expression, so it is a NAMED loss, not a clamp', () => {
    // `-4` parses as a unary expression rather than a numeric literal, so
    // `readStaticAttr` does not see a static value — the lower clamp
    // (`Math.max(0, …)`) is therefore unreachable from source. The prop is
    // dropped, and the dynamic-prop guard says so rather than going silent.
    const { code, warnings } = tx(`<Audio src="/a.mp3" volume={-4} />`)
    expect(code).not.toContain('volume:')
    expect(warnings.some((w) => w.includes('<Audio volume> was given a non-static value'))).toBe(
      true,
    )
  })

  it('a DYNAMIC src bails; each dynamic boolean and volume warns', () => {
    expect(tx(`<Audio src={url()} />`).code).not.toContain('PyreonAudioPlayer')
    for (const p of ['autoPlay', 'loop', 'muted']) {
      expect(tx(`<Audio src="/a.mp3" ${p}={on()} />`).warnings.some((w) => w.includes(p)), p).toBe(
        true,
      )
    }
    expect(
      tx(`<Audio src="/a.mp3" volume={on() ? 1 : 0} />`).warnings.some((w) =>
        w.includes('volume'),
      ),
    ).toBe(true)
  })

  it('onStatusChange param vs no-param, as on <Video>', () => {
    expect(tx(`<Audio src="/a.mp3" onStatusChange={(s) => fn(s)} />`).code).toContain(
      'onStatusChange: { s in',
    )
    expect(tx(`<Audio src="/a.mp3" onStatusChange={() => fn('x')} />`).code).toContain(
      'onStatusChange: { _ in',
    )
  })
})

describe('<For> — the `by` key resolution matrix', () => {
  it('a MEMBER key lowers to that field; an IDENTITY key to \\.self', () => {
    expect(tx(`<For each={rows} by={(r) => r.id}>{(r) => <Text>x</Text>}</For>`).code).toContain(
      'id: \\.id',
    )
    expect(tx(`<For each={names} by={(n) => n}>{(n) => <Text>x</Text>}</For>`).code).toContain(
      'id: \\.self',
    )
  })

  it('a by-arrow matching NEITHER shape warns and falls back to \\.id', () => {
    const { code, warnings } = tx(
      `<For each={rows} by={(r) => r.id + '!'}>{(r) => <Text>x</Text>}</For>`,
    )
    expect(warnings.some((w) => w.includes('this by-callback matches neither'))).toBe(true)
    expect(code).toContain('id: \\.id')
  })

  it('a by FUNCTION REFERENCE warns its own named message', () => {
    const { warnings } = tx(
      `<For each={rows} by={fn}>{(r) => <Text>x</Text>}</For>`,
    )
    expect(warnings.some((w) => w.includes('a function REFERENCE has no KeyPath analog'))).toBe(
      true,
    )
  })

  it('NO by on a primitive element array resolves \\.self without warning', () => {
    const { code, warnings } = tx(`<For each={names}>{(n) => <Text>x</Text>}</For>`)
    expect(code).toContain('id: \\.self')
    expect(warnings.some((w) => w.includes('For'))).toBe(false)
  })

  it('a MISSING render arrow emits the EmptyView placeholder', () => {
    const { code } = tx(`<For each={names}></For>`)
    expect(code).toContain('{ _ in EmptyView() }')
  })

  it('no `each` attr at all falls back to the literal `items` receiver', () => {
    expect(tx(`<For>{(n) => <Text>x</Text>}</For>`).code).toContain('ForEach(items,')
  })
})

describe('<Show> — the `when` presence arm', () => {
  it('when present emits its condition; ABSENT emits `if true`', () => {
    expect(tx(`<Show when={on()}><Text>x</Text></Show>`).code).toContain('if on {')
    expect(tx(`<Show><Text>x</Text></Show>`).code).toContain('if true {')
  })
})

describe('<Transition> — symmetric vs asymmetric animation', () => {
  it('no per-side props → ONE ambient animation, no .asymmetric', () => {
    const { code } = tx(`<Transition show={on()} duration={200}><Text>x</Text></Transition>`)
    expect(code).not.toContain('.asymmetric(')
    expect(code).toContain('.animation(')
  })

  it('a per-side DURATION alone switches to .asymmetric', () => {
    expect(
      tx(`<Transition show={on()} enterDuration={100}><Text>x</Text></Transition>`).code,
    ).toContain('.asymmetric(')
  })

  it('a per-side EASING alone also switches to .asymmetric', () => {
    expect(
      tx(`<Transition show={on()} leaveEasing="ease-in"><Text>x</Text></Transition>`).code,
    ).toContain('.asymmetric(')
  })

  it('a NON-LITERAL per-side duration warns and falls back to the symmetric one', () => {
    const { warnings } = tx(
      `<Transition show={on()} duration={200} enterDuration={on() ? 1 : 2}><Text>x</Text></Transition>`,
    )
    expect(warnings.some((w) => w.includes('<Transition enterDuration>'))).toBe(true)
  })

  it('a non-literal leaveDuration warns under its OWN name', () => {
    const { warnings } = tx(
      `<Transition show={on()} leaveDuration={on() ? 1 : 2}><Text>x</Text></Transition>`,
    )
    expect(warnings.some((w) => w.includes('<Transition leaveDuration>'))).toBe(true)
  })
})
