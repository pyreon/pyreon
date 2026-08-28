/**
 * Two verified NEGATIVE results, locked so they stay true.
 *
 * Both came out of sweeps that found nothing, which is worth keeping precisely
 * because everything else in this area did find something: props that never
 * reached the emit, defaults that disagreed across targets, a union member
 * silently approximated, a primitive that had never compiled anywhere.
 *
 *  1. Every documented event prop reaches the emit on both targets. A handler
 *     that does not is a dead control — it renders, it looks right, and the tap
 *     does nothing.
 *  2. Every signal-valued prop emits DIFFERENTLY from the same prop given a
 *     static value. Identical output means the signal froze to that value: it
 *     compiles, renders once, and never updates.
 *
 * Each block carries a POSITIVE CONTROL, because a probe that cannot fail is
 * worth nothing and this file's first draft was exactly that. The reactivity
 * sweep originally grepped the emit for the signal's NAME — which always
 * appears, since the signal is declared — so it reported "all clean" without
 * being able to report anything else.
 */

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'
const IMPORTS =
  'Stack, Text, Image, Button, Press, Field, Toggle, Modal, Transition, Video, Audio, WebView'

const app = (jsx: string): string =>
  `import { signal } from '@pyreon/reactivity'
import { ${IMPORTS} } from '${P}'
export function C() {
  const v = signal('')
  const b = signal(false)
  const num = signal(3)
  const sc = signal('primary')
  const al = signal('center')
  const ft = signal('contain')
  const sz = signal('lg')
  const hit = signal(0)
  return <Stack>${jsx}</Stack>
}`

const emit = (jsx: string, target: 'swift' | 'kotlin'): string =>
  transform(app(jsx), { target }).code

// ── 1. events ───────────────────────────────────────────────────────────────

/** Every event prop declared across the primitive types, with a unique marker. */
const EVENTS: [string, string, string][] = [
  ['Button.onPress', '1', `<Button onPress={() => { hit.set(1) }}>x</Button>`],
  ['Press.onPress', '2', `<Press onPress={() => { hit.set(2) }}><Text>x</Text></Press>`],
  ['Press.onLongPress', '3', `<Press onPress={() => {}} onLongPress={() => { hit.set(3) }}><Text>x</Text></Press>`],
  ['Press.onSwipeLeft', '4', `<Press onPress={() => {}} onSwipeLeft={() => { hit.set(4) }}><Text>x</Text></Press>`],
  ['Press.onSwipeRight', '5', `<Press onPress={() => {}} onSwipeRight={() => { hit.set(5) }}><Text>x</Text></Press>`],
  ['Field.onChangeText', '6', `<Field value={v()} onChangeText={(n) => { hit.set(6) }} />`],
  ['Field.onSubmit', '7', `<Field value={v()} onChangeText={(n) => v.set(n)} onSubmit={() => { hit.set(7) }} />`],
  ['Toggle.onChange', '8', `<Toggle value={b()} onChange={(n) => { hit.set(8) }} />`],
  ['Modal.onClose', '9', `<Modal open onClose={() => { hit.set(9) }}>x</Modal>`],
  ['Video.onStatusChange', '10', `<Video src="https://x.t/a.mp4" onStatusChange={(s) => { hit.set(10) }} />`],
  ['Audio.onStatusChange', '11', `<Audio src="https://x.t/a.mp3" onStatusChange={(s) => { hit.set(11) }} />`],
  ['WebView.onMessage', '12', `<WebView html="<p>x</p>" onMessage={(m) => { hit.set(12) }} />`],
]

const carriesMarker = (code: string, marker: string): boolean =>
  new RegExp(`hit = ${marker}\\b|hit\\.value = ${marker}\\b|= ${marker}\\b`).test(code)

describe('every documented event handler reaches the emit', () => {
  it.each(EVENTS.flatMap(([label, marker, jsx]) =>
    (['swift', 'kotlin'] as const).map((t) => [`${label} (${t})`, marker, jsx, t] as const),
  ))('%s', (_label, marker, jsx, target) => {
    expect(carriesMarker(emit(jsx, target), marker)).toBe(true)
  })

  it('POSITIVE CONTROL: the marker check can fail', () => {
    // A handler body that is never written must not be found, or the assertions
    // above prove nothing.
    expect(carriesMarker(emit(`<Button onPress={() => { hit.set(1) }}>x</Button>`, 'swift'), '99'))
      .toBe(false)
  })
})

// ── 2. reactivity ───────────────────────────────────────────────────────────

/** [prop, template with {CV}, a static value, the signal expression]. */
const DYNAMIC: [string, string, string, string][] = [
  ['Text.color', `<Text color={CV}>x</Text>`, `'primary'`, 'sc()'],
  ['Text.size', `<Text size={CV}>x</Text>`, `'lg'`, 'sz()'],
  ['Stack.background', `<Stack background={CV}><Text>x</Text></Stack>`, `'primary'`, 'sc()'],
  ['Stack.align', `<Stack align={CV}><Text>x</Text></Stack>`, `'center'`, 'al()'],
  ['Stack.gap', `<Stack gap={CV}><Text>x</Text></Stack>`, '3', 'num()'],
  ['Stack.padding', `<Stack padding={CV}><Text>x</Text></Stack>`, '3', 'num()'],
  ['Stack.margin', `<Stack margin={CV}><Text>x</Text></Stack>`, '3', 'num()'],
  ['Image.fit', `<Image src="https://x.t/a.png" alt="a" fit={CV} />`, `'contain'`, 'ft()'],
  ['Button.disabled', `<Button onPress={() => {}} disabled={CV}>x</Button>`, 'true', 'b()'],
  ['Press.disabled', `<Press onPress={() => {}} disabled={CV}><Text>x</Text></Press>`, 'true', 'b()'],
  ['Modal.open', `<Modal open={CV} onClose={() => {}}>x</Modal>`, 'true', 'b()'],
  ['Transition.show', `<Transition show={CV}><Text>x</Text></Transition>`, 'true', 'b()'],
  ['Video.controls', `<Video src="https://x.t/a.mp4" controls={CV} />`, 'false', 'b()'],
]

/** The element's emit, minus the state declarations, which differ trivially. */
const elementOnly = (code: string): string =>
  code
    .split('\n')
    .filter((l) => !/signal|mutableStateOf|@State|remember/.test(l))
    .join('\n')

const frozen = (tpl: string, staticVal: string, sigExpr: string, target: 'swift' | 'kotlin'): boolean =>
  elementOnly(emit(tpl.replace('{CV}', `{${sigExpr}}`), target)) ===
  elementOnly(emit(tpl.replace('{CV}', `{${staticVal}}`), target))

describe('a signal-valued prop stays live, rather than freezing to its value', () => {
  it.each(DYNAMIC.flatMap(([label, tpl, sv, se]) =>
    (['swift', 'kotlin'] as const).map((t) => [`${label} (${t})`, tpl, sv, se, t] as const),
  ))('%s', (_label, tpl, staticVal, sigExpr, target) => {
    expect(frozen(tpl, staticVal, sigExpr, target)).toBe(false)
  })

  it('POSITIVE CONTROL: the comparison reports a prop that does NOT lower', () => {
    // `justify` lowers on neither target (it warns instead), so the dynamic and
    // static emits are identical. If this stops being detected, the assertions
    // above have gone vacuous.
    const tpl = `<Stack justify={CV}><Text>x</Text></Stack>`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(frozen(tpl, `'center'`, 'al()', target)).toBe(true)
      expect(
        transform(app(tpl.replace('{CV}', '{al()}')), { target }).warnings.some((w) =>
          w.toLowerCase().includes('justify'),
        ),
      ).toBe(true)
    }
  })
})
