// Kotlin emit — `<Audio>` / `<Video>` / `<Image>` / `<WebView>` / `<Icon>` /
// `<Layer>` / `<Scroll>` / `<Modal>` / `<Heading>` and the sortable `ref`.
//
// Each of these bakes at least one prop at COMPILE time, so the interesting
// arm is always the decline: a non-static value the emit cannot follow, an
// unknown token that must resolve to the documented default rather than be
// spliced through as an unresolved platform symbol, and the element with no
// children (a shape every container emit has to special-case, because Kotlin's
// trailing-lambda form differs).
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const lines = (src: string) => kotlin(src).code.split('\n').map((l) => l.trim())
const find = (src: string, prefix: string) => lines(src).filter((l) => l.startsWith(prefix))

describe('<Audio> / <Video> baked props on Kotlin', () => {
  const MEDIA = `import { signal } from '@pyreon/reactivity'
import { Stack, Audio, Video } from '@pyreon/primitives'
export function App() {
  const on = signal(true)
  const vol = signal(0.5)
  const url = signal('https://x/y.mp3')
  return (<Stack>
    <Audio src="clip.mp3" muted volume={2} />
    <Audio src="a.mp3" autoPlay={on()} loop={on()} muted={on()} volume={vol()} />
    <Video src={url()} />
  </Stack>)
}`

  it('static `muted` reaches the player and an out-of-range `volume` is clamped, not passed through', () => {
    // The runtime takes 0…1; `volume={2}` is a user mistake the emit must not
    // forward — Media3 would throw on it.
    expect(find(MEDIA, 'PyreonAudioPlayer')[0]).toBe(
      'PyreonAudioPlayer(url = "clip.mp3", muted = true, volume = 1, engine = Media3AudioEngine(LocalContext.current))',
    )
  })

  it('every non-static baked prop is named individually — autoPlay, loop, muted AND volume', () => {
    const ws = kotlin(MEDIA).warnings
    for (const prop of ['autoPlay', 'loop', 'muted', 'volume']) {
      expect(ws.some((w) => w.startsWith(`<Audio ${prop}> was given a non-static value`))).toBe(true)
    }
    // …and the dropped props really are dropped — the second player carries
    // only the url and the engine.
    expect(find(MEDIA, 'PyreonAudioPlayer')[1]).toBe(
      'PyreonAudioPlayer(url = "a.mp3", engine = Media3AudioEngine(LocalContext.current))',
    )
  })

  it('a non-static `src` declines to the generic emit on BOTH media tags', () => {
    expect(find(MEDIA, 'Video(')).toContain('Video(src = url)')
    const audioDyn = `import { signal } from '@pyreon/reactivity'
import { Stack, Audio } from '@pyreon/primitives'
export function App() { const u = signal('a.mp3'); return (<Stack><Audio src={u()} /></Stack>) }`
    expect(find(audioDyn, 'Audio(')).toContain('Audio(src = u)')
  })

  it('a <Video> that fell through to generic emit is NAMED as such', () => {
    expect(
      kotlin(MEDIA).warnings.some((w) => w.startsWith('<Video> matched no shape the Kotlin emitter lowers')),
    ).toBe(true)
  })

  it(
    'an <Audio> that falls through to generic emit is NAMED as such on BOTH targets, like <Video> '
      + '(was silent: Audio was missing from CANONICAL_PRIMITIVES, the Set that gates the fell-through warning)',
    () => {
      const audioDyn = `import { signal } from '@pyreon/reactivity'
import { Stack, Audio } from '@pyreon/primitives'
export function App() { const u = signal('a.mp3'); return (<Stack><Audio src={u()} /></Stack>) }`
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(audioDyn, { target })
        // The emit is `Audio(src = u)` / `Audio(src: u)` — not a Kotlin
        // composable and not a SwiftUI type, so the build fails naming a
        // symbol the user never wrote. That is exactly what the
        // fell-through warning exists to pre-empt.
        expect(
          r.warnings.some((w) => w.startsWith('<Audio> matched no shape')),
          `${target}: ${JSON.stringify(r.warnings)}`,
        ).toBe(true)
      }
    },
  )
})

describe('<Image> / <Icon> token resolution on Kotlin', () => {
  const ART = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Image, Video, Layer, Icon } from '@pyreon/primitives'
export function App() {
  return (<Stack>
    <Icon name="star" size="huge" />
    <Video src="clip.mp4" width={320} height={180} />
    <Image src="logo.png" width={40} fit="odd" />
    <Image src="pic.png" />
    <Layer align="weird"><Text>x</Text></Layer>
    <Layer align="center" />
  </Stack>)
}`

  it('an unknown `size` on <Icon> and an unknown `fit` on <Image> fall back to the documented defaults', () => {
    expect(find(ART, 'Icon(')[0]).toContain('modifier = Modifier.size(20.dp)')
    expect(find(ART, 'Image(')[0]).toContain('contentScale = ContentScale.Crop')
  })

  it('a bundled image with no `alt` still emits an (empty) contentDescription — the arg is required', () => {
    expect(find(ART, 'Image(')[1]).toBe(
      'Image(painter = painterResource(pyreonDrawable("pic")), contentDescription = "", contentScale = ContentScale.Crop)',
    )
  })

  it('width/height become their own Modifier chain when no layout modifier precedes them', () => {
    expect(find(ART, 'PyreonVideoPlayer')[0]).toBe(
      'PyreonVideoPlayer(url = "clip.mp4", modifier = Modifier.width(320.dp).height(180.dp))',
    )
    expect(find(ART, 'Image(')[0]).toContain('modifier = Modifier.width(40.dp)')
  })

  it('an unrecognized <Layer align> is named and falls back to centre; a childless Layer keeps the empty lambda', () => {
    expect(
      kotlin(ART).warnings.some((w) => w.startsWith('<Layer align="weird"> uses an unrecognized align value')),
    ).toBe(true)
    expect(find(ART, 'Box(contentAlignment')).toContain('Box(contentAlignment = Alignment.Center) {}')
  })
})

describe('<Heading> level resolution on Kotlin', () => {
  const H = `import { signal } from '@pyreon/reactivity'
import { Stack, Heading } from '@pyreon/primitives'
export function App() {
  const big = signal(true)
  return (<Stack>
    <Heading level={9}>out of range</Heading>
    <Heading />
    <Heading level={big() ? 'a' : 'b'}>non-numeric</Heading>
  </Stack>)
}`

  it('an out-of-range level, a childless heading and a NON-numeric level all resolve to h4', () => {
    const got = find(H, 'Text(')
    expect(got[0]).toBe('Text(text = "out of range", style = MaterialTheme.typography.h4)')
    expect(got[1]).toBe('Text(text = "", style = MaterialTheme.typography.h4)')
    // Both ternary arms are non-numeric, so both resolve to the default.
    expect(got[2]).toBe(
      'Text(text = "non-numeric", style = (if (big) MaterialTheme.typography.h4 else MaterialTheme.typography.h4))',
    )
  })
})

describe('<WebView> content and message handler on Kotlin', () => {
  const WV = `import { signal } from '@pyreon/reactivity'
import { Stack, WebView } from '@pyreon/primitives'
export function App() {
  const n = signal(1)
  const url = signal('https://x')
  return (<Stack>
    <WebView onMessage={(m: string) => n.set(m.length)} />
    <WebView html="<b>x</b>" onMessage={() => {}} />
    <WebView html="<b>y</b>" onMessage={(m: string) => n.set(1)} />
    <WebView html="<b>z</b>" onMessage={() => n.set(2)} />
    <WebView src={url()} />
    <WebView html={() => url()} />
  </Stack>)
}`

  it('a WebView with neither html nor src is named and emits the empty host', () => {
    expect(kotlin(WV).warnings).toContain(
      '<WebView>: needs an `html` or `src` attribute on native; emitting an empty PyreonWebView().',
    )
    expect(find(WV, 'PyreonWebView')[0]).toBe('PyreonWebView()')
  })

  it('an empty-body message handler becomes a truly empty lambda, and a zero-param one gets the `_` binder', () => {
    const got = find(WV, 'PyreonWebView')
    expect(got[1]).toBe('PyreonWebView(html = "<b>x</b>", onMessage = { _ -> })')
    expect(got[2]).toBe('PyreonWebView(html = "<b>y</b>", onMessage = { m -> n = 1 })')
    expect(got[3]).toBe('PyreonWebView(html = "<b>z</b>", onMessage = { _ -> n = 2 })')
  })

  it('a DYNAMIC src, and an accessor-arrow html, both reach the host unwrapped', () => {
    const got = find(WV, 'PyreonWebView')
    expect(got[4]).toBe('PyreonWebView(src = url)')
    // `html={() => url()}` — the zero-arg accessor is unwrapped rather than
    // emitted as a Kotlin lambda (which would render its toString).
    expect(got[5]).toBe('PyreonWebView(html = url)')
  })
})

describe('<Scroll> / <Modal> / <Press> container shapes on Kotlin', () => {
  const MISC = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Scroll, Modal, Press } from '@pyreon/primitives'
export function App() {
  const open = signal(false)
  return (<Stack>
    <Scroll />
    <Modal open={open()} />
    <Modal open={open()} data-testid="m" />
    <Press onPress={() => open.set(true)} />
  </Stack>)
}`

  it('every childless container keeps a syntactically valid trailing lambda', () => {
    const code = kotlin(MISC).code
    expect(code).toContain('Column(modifier = Modifier.verticalScroll(rememberScrollState())) {}')
    expect(code).toContain('Dialog(onDismissRequest = {}) {}')
    // A Modal with no `onClose` still needs the required onDismissRequest arg.
    expect(code).toContain('Box(modifier = Modifier.testTag("m")) { }')
    expect(code).toContain('Box(modifier = Modifier.clickable(onClick = { open = true })) {}')
  })

  it('a <For> nested under a FRAGMENT inside a <Scroll> is still caught by the measure-time warning', () => {
    // The scan has to descend through the fragment — a LazyColumn inside a
    // vertically-scrolling Column is an IllegalStateException at measure time,
    // which is a runtime crash no compile gate can see.
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Scroll, For } from '@pyreon/primitives'
export function App() {
  const rows = signal([{ id: 1 }])
  return (<Stack><Scroll>
    <Text>header</Text>
    <><For each={rows()} by={(r: { id: number }) => r.id}>{(r: { id: number }) => <Text>{r.id}</Text>}</For></>
  </Scroll></Stack>)
}`)
    expect(r.warnings.some((w) => w.startsWith('<Scroll> with a <For> among OTHER children'))).toBe(true)
  })
})

describe('sortable item key coercion on Kotlin', () => {
  const sortable = (key: string) => `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const items = signal<string[]>(['a'])
  const name = signal<string>('a')
  const n = signal<number>(1)
  const s = useSortable({ items: () => items(), by: (i) => i, onReorder: (x) => items.set(x) })
  return (<Stack ref={s.containerRef}><Text ref={s.itemRef(${key})}>x</Text></Stack>)
}`

  it('a STRING-typed key is passed through; anything else is coerced', () => {
    // PyreonSortableState keys on String, so a non-String key would not
    // typecheck — but coercing a String would be pointless noise.
    expect(find(sortable('name()'), 'Text(')[0]).toContain('.pyreonSortableItem(s, name)')
    expect(find(sortable("'lit'"), 'Text(')[0]).toContain('.pyreonSortableItem(s, "lit")')
    expect(find(sortable('n()'), 'Text(')[0]).toContain('.pyreonSortableItem(s, (n).toString())')
  })
})

describe('media/asset positive twins', () => {
  it('a <Video> with no explicit size carries no width modifier, and an <Image alt> reaches contentDescription', () => {
    const r = kotlin(`import { Stack, Image, Video, WebView } from '@pyreon/primitives'
const onMsg = (m: string) => { }
export function App() {
  return (<Stack>
    <Video src="clip.mp4" />
    <Image src="logo.png" alt="A logo" />
    <WebView html="<b>x</b>" onMessage={onMsg} />
  </Stack>)
}`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonVideoPlayer(url = "clip.mp4")')
    expect(r.code).toContain('contentDescription = "A logo"')
    // A message handler that is a NAME is wrapped so the frame's payload is
    // still passed — a bare reference would drop the argument.
    expect(r.code).toContain('onMessage = { pyreonMsg -> onMsg(pyreonMsg) }')
  })

  it('a <Modal onClose> and a <Link> with children keep their content', () => {
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Modal, Link } from '@pyreon/primitives'
export function App() {
  const open = signal(false)
  return (<Stack>
    <Modal open={open()} onClose={() => open.set(false)}><Text>body</Text></Modal>
    <Link to="/x"><Text>go</Text></Link>
  </Stack>)
}`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Dialog(onDismissRequest = { open = false }) {')
    expect(r.code).toContain('Text(text = "body")')
    expect(r.code).toContain('Text(text = "go")')
  })
})

describe('container positive twins', () => {
  it('a <Press> WITH children wraps them rather than emitting the empty lambda', () => {
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Press } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  return (<Stack><Press onPress={() => n.set(1)}><Text>tap</Text></Press></Stack>)
}`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Box(modifier = Modifier.clickable(onClick = { n = 1 })) {')
    expect(r.code).toContain('Text(text = "tap")')
  })

  it('the lazy-list scan walks PAST a plain interpolation child to find the <For> underneath', () => {
    // The scan has to skip a non-element expression child rather than stop at
    // it; stopping would lose the measure-time warning for the <For> after it.
    const r = kotlin(`import { signal } from '@pyreon/reactivity'
import { Stack, Text, Scroll, For } from '@pyreon/primitives'
interface Row { m: string }
const ROWS: Row[] = [{ m: 'Jan' }]
export function App() {
  const n = signal(0)
  return (<Stack><Scroll>
    <Text>a</Text>{n()}
    <For each={ROWS} by={(r: Row) => r.m}>{(r: Row) => <Text>{r.m}</Text>}</For>
  </Scroll></Stack>)
}`)
    expect(r.warnings.some((w) => w.startsWith('<Scroll> with a <For> among OTHER children'))).toBe(true)
  })
})
