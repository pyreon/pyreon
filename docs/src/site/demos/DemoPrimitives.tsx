import type { VNodeChild } from '@pyreon/core'
import { For } from '@pyreon/core'
import { Button, Field, Image, Inline, Modal, Scroll, Select, Stack, Text, Toggle } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { stills } from '../content/visuals/primitives.json'
import type { ThemedPicture as ThemedPictureData } from '../content/visuals'
import { font, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { DemoSurface, GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { CardSegmented, PaperText, SimulatedNote } from '../kit/demo-parts'
import { Eyebrow, StatusBadge } from '../kit/type'
import { ThemedPicture } from './_asset'

/**
 * Primitives demo (`primitives.json` → demo): pick a primitive; the web
 * column renders the REAL `@pyreon/primitives` component live in this page,
 * beside what the native compiler emits for iOS and Android (abridged and
 * labelled "illustrative": the page cannot run the native compiler). Below,
 * real captures of one app built from one source on all three targets.
 * Mappings follow the spec: Field → `TextField("", text: Binding(…))`,
 * Toggle → `<input type="checkbox" role="switch">`, Modal → `<dialog>` +
 * `showModal()`, Tabs → `PyreonTabs`. Gesture, Select and Tabs are tagged
 * "next release".
 */
const NAMES = ['Stack', 'Inline', 'Text', 'Button', 'Field', 'Toggle', 'Select', 'Modal', 'Image', 'Scroll', 'Tabs', 'Gesture'] as const
type Name = (typeof NAMES)[number]
const NEXT_RELEASE: ReadonlySet<Name> = new Set(['Gesture', 'Select', 'Tabs'])

const OUT: Record<Name, readonly [web: string, ios: string, android: string]> = {
  Stack: ['<div style="display:flex;\n  flex-direction:column;\n  gap:12px">', 'VStack(spacing: 12) {\n  …\n}', 'Column(\n  verticalArrangement =\n    Arrangement.spacedBy(12.dp)\n) { … }'],
  Inline: ['<div style="display:flex;\n  flex-direction:row">', 'HStack { … }', 'Row { … }'],
  Text: ['<span>…</span>', 'Text("…")', 'Text("…")'],
  Button: ['<button>Save</button>', 'Button("Save") { … }', 'Button(onClick = { … }) {\n  Text("Save")\n}'],
  Field: ['<input value=…>', 'TextField("", text: Binding(…))', 'TextField(draft,\n  onValueChange = { … })'],
  Toggle: ['<input type="checkbox"\n  role="switch">', 'Toggle("", isOn: Binding(…))', 'Switch(checked = on,\n  onCheckedChange = { … })'],
  Select: ['<select>…</select>', 'PyreonSelect  // menu Picker', 'PyreonSelect  // Material 3\n// ExposedDropdownMenuBox'],
  Modal: ['<dialog> + showModal()', '.sheet(isPresented: $open)', 'Dialog(onDismissRequest = …)'],
  Image: ['<img src=… alt=…>', 'AsyncImage(url: …)', 'AsyncImage(model = …)'],
  Scroll: ['<div style="overflow:auto">', 'ScrollView { … }', 'Column(Modifier\n  .verticalScroll(…))'],
  Tabs: ['<div role="tablist">…', 'PyreonTabs  // TabView', 'PyreonTabs  // BottomNavigation,\n// NavigationRail at 600dp+'],
  Gesture: ['pointer events,\ntouch-action:none', 'PyreonGesture { … }\n// Drag/Magnify/Rotate', 'PyreonGesture { … }'],
}

const Head = el
  .config({ name: 'PrimitivesHead' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme(() => ({ flexWrap: 'wrap', marginBottom: 14 }))

const Columns = el
  .config({ name: 'PrimitivesColumns' })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: 12 }))

const ColHead = el.config({ name: 'PrimitivesColHead' }).attrs({ block: true }).theme(() => ({ paddingTop: 14, paddingLeft: 18, paddingRight: 18 }))

const Live = el.config({ name: 'PrimitivesLive' }).attrs({ block: true, gap: 8 }).theme(() => ({ minHeight: 72, paddingTop: 14, paddingBottom: 6 }))

const Footer = el
  .config({ name: 'PrimitivesFooter' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme(() => ({ flexWrap: 'wrap', marginTop: 16 }))

const Stills = el
  .config({ name: 'PrimitivesStills' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 10, sm: 20 }, listStyle: 'none', margin: 0, marginTop: 20, padding: 0, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }))

const StillFrame = el
  .config({ name: 'PrimitivesStill' })
  .attrs({ tag: 'figure', block: true, gap: 8, contentAlignX: 'center' })
  .theme((_t, m) => ({ margin: 0, extendCss: `& img { border-radius: ${radius.note}px; border: 1px solid ${tone(m, 'line')}; }` }))

const Caption = txt
  .config({ name: 'PrimitivesStillCaption' })
  .attrs({ tag: 'figcaption' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size - 1, lineHeight: 1.4, color: tone(m, 'fog'), textAlign: 'center' }))

const STILLS: readonly { key: 'today-web' | 'today-ios' | 'today-android'; label: string }[] = [
  { key: 'today-web', label: 'Web · Chromium' },
  { key: 'today-ios', label: 'iOS · SwiftUI' },
  { key: 'today-android', label: 'Android · Compose' },
]

/** Short enough that the five rows scroll. */
const SCROLL_STYLE = 'max-height: 72px'

/** The real web primitive for each name, live. */
function LiveWeb(props: { name: Name }) {
  const draft = signal('')
  const on = signal(true)
  const choice = signal('web')
  const open = signal(false)
  const presses = signal(0)
  const views: Record<Name, () => VNodeChild> = {
    Stack: () => (
      <Stack gap="md">
        <Text>Hello</Text>
        <Text>World</Text>
      </Stack>
    ),
    Inline: () => (
      <Inline gap="md">
        <Text>Hello</Text>
        <Text>World</Text>
      </Inline>
    ),
    Text: () => (
      <Text size="lg" weight="bold">
        Today
      </Text>
    ),
    Button: () => (
      <Stack gap="sm">
        <Button onPress={() => presses.update((n) => n + 1)}>Save</Button>
        <PaperText>{() => `onPress ran ${presses()}×`}</PaperText>
      </Stack>
    ),
    Field: () => (
      <Stack gap="sm">
        <Field value={() => draft()} onChangeText={(t) => draft.set(t)} placeholder="Add a todo" aria-label="Add a todo" />
        <PaperText>{() => `draft = "${draft()}"`}</PaperText>
      </Stack>
    ),
    Toggle: () => (
      <Inline gap="sm" align="center">
        <Toggle value={() => on()} onChange={(v) => on.set(v)} aria-label="Book the dentist" />
        <PaperText>{() => `on = ${on()}`}</PaperText>
      </Inline>
    ),
    Select: () => (
      <Select
        value={() => choice()}
        onChange={(v) => choice.set(v)}
        aria-label="Target"
        options={[
          { value: 'web', label: 'Web' },
          { value: 'ios', label: 'iOS' },
          { value: 'android', label: 'Android' },
        ]}
      />
    ),
    Modal: () => (
      <>
        <Button onPress={() => open.set(true)}>Open the dialog</Button>
        <Modal open={() => open()} onClose={() => open.set(false)}>
          <Stack gap="md">
            <Text weight="bold">A real dialog</Text>
            <Text>Opened with showModal(); Escape closes it.</Text>
            <Button onPress={() => open.set(false)}>Close</Button>
          </Stack>
        </Modal>
      </>
    ),
    Image: () => <Image src="/favicon.svg" alt="The Pyreon mark" width={48} height={48} fit="contain" />,
    Scroll: () => (
      <Scroll style={SCROLL_STYLE} aria-label="Scrolling list">
        <Stack gap="xs">
          <For each={['Water the basil', 'Book the dentist', 'Call Grandma back', 'Pick up oat milk', 'Ship v1']} by={(t) => t}>
            {(t) => <Text>{t}</Text>}
          </For>
        </Stack>
      </Scroll>
    ),
    Tabs: () => <PaperText>Tabs are driven by a router or a signal; this column shows their web output only.</PaperText>,
    Gesture: () => <PaperText>Drag, magnify and rotate need a touch pointer; this column shows the web output only.</PaperText>,
  }
  return <Live>{views[props.name]()}</Live>
}

export default function DemoPrimitives() {
  const current = signal<Name>('Toggle')
  return (
    <div>
      <GlowCard>
        <Head>
          <Eyebrow>primitive</Eyebrow>
          <CardSegmented label="Primitive" options={NAMES} value={() => current()} onChange={(v) => current.set(v)} />
        </Head>
        <Columns>
          <GlowCard padding="flush">
            <ColHead>
              <Eyebrow>web · DOM, live</Eyebrow>
            </ColHead>
            <CodeBlock code={OUT[current()][0]} label="Web output" />
            <DemoSurface aria-label="The web primitive, live">
              {() => {
                const n = current()
                return <LiveWeb name={n} />
              }}
            </DemoSurface>
          </GlowCard>
          <GlowCard padding="flush" state="hot">
            <ColHead>
              <Eyebrow state="accent">iOS · SwiftUI</Eyebrow>
            </ColHead>
            <CodeBlock code={OUT[current()][1]} label="iOS output" />
          </GlowCard>
          <GlowCard padding="flush" state="hot">
            <ColHead>
              <Eyebrow state="accent">Android · Compose</Eyebrow>
            </ColHead>
            <CodeBlock code={OUT[current()][2]} label="Android output" />
          </GlowCard>
        </Columns>
        <Footer>
          {() => (NEXT_RELEASE.has(current()) ? <StatusBadge>next release</StatusBadge> : null)}
          <SimulatedNote>Illustrative, abridged: the iOS and Android columns are not compiled live in this page. The web column is the real component.</SimulatedNote>
        </Footer>
      </GlowCard>
      <Stills aria-label="One app, Today, on all three targets">
        <For each={STILLS} by={(s) => s.key}>
          {(s) => (
            <li>
              <StillFrame>
                <ThemedPicture data={stills[s.key] as ThemedPictureData} sizes="(min-width: 800px) 200px, 30vw" />
                <Caption>{s.label}</Caption>
              </StillFrame>
            </li>
          )}
        </For>
      </Stills>
    </div>
  )
}
