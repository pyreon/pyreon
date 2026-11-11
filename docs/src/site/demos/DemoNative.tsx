import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { stills } from '../content/visuals/native.json'
import type { ThemedPicture as ThemedPictureData } from '../content/visuals'
import { font, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { Segmented } from '../kit/controls'
import { SimulatedNote } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'
import { ThemedPicture } from './_asset'
import { KitScope } from '../kit/scope'

/**
 * Native demo (`native.json` → demo). A SIMULATION, labelled on screen: the
 * page cannot run the native compiler, so each primitive shows the TSX you
 * write beside abridged output for the web, SwiftUI and Compose (the real
 * emit adds tokens, accessibility and modifiers). Below it, real captures of
 * one app built from one source file on all three targets.
 *
 * Every TSX sample declares its signal locally: a module-scope signal
 * imported from another file is the shape #4313 breaks on native.
 */
const SOURCES = ['Stack', 'Field', 'Toggle', 'Button', 'For'] as const
type Source = (typeof SOURCES)[number]

const OUT: Record<Source, readonly [tsx: string, web: string, ios: string, android: string]> = {
  Stack: [
    '<Stack gap="md">\n  <Text>Hello</Text>\n  <Text>World</Text>\n</Stack>',
    '<div style="display:flex;\n  flex-direction:column;\n  gap:12px">\n  <span>Hello</span>\n  <span>World</span>\n</div>',
    'VStack(spacing: 12) {\n  Text("Hello")\n  Text("World")\n}',
    'Column(\n  verticalArrangement =\n    Arrangement.spacedBy(12.dp)\n) {\n  Text("Hello")\n  Text("World")\n}',
  ],
  Field: [
    "const name = signal('')\n\n<Field\n  value={name}\n  onChangeText={(t) => name.set(t)}\n/>",
    '<input\n  value="…"\n  oninput="name.set(…)">',
    '@State var name = ""\n\nTextField("", text: $name)',
    'var name by remember {\n  mutableStateOf("")\n}\nTextField(\n  value = name,\n  onValueChange = { name = it }\n)',
  ],
  Toggle: [
    'const on = signal(false)\n\n<Toggle\n  value={on}\n  onChange={(v) => on.set(v)}\n/>',
    '<input type="checkbox"\n  role="switch">',
    '@State var on = false\n\nToggle("", isOn: $on)',
    'var on by remember {\n  mutableStateOf(false)\n}\nSwitch(\n  checked = on,\n  onCheckedChange = { on = it }\n)',
  ],
  Button: [
    '<Button onPress={save}>\n  Save\n</Button>',
    '<button type="button"\n  onclick="save()">\n  Save\n</button>',
    'Button("Save") {\n  save()\n}',
    'Button(onClick = { save() }) {\n  Text("Save")\n}',
  ],
  For: [
    '<For each={todos}\n  by={(t) => t.id}>\n  {(t) => <Text>{t.text}</Text>}\n</For>',
    '<!-- keyed list, -->\n<!-- one node per todo -->\n<span>Buy milk</span>\n<span>Ship v1</span>',
    'ForEach(todos,\n  id: \\.id) { t in\n  Text(t.text)\n}',
    'LazyColumn {\n  items(todos,\n    key = { it.id }) { t ->\n    Text(t.text)\n  }\n}',
  ],
}

const PANELS = [
  { label: 'TSX · you write', hot: false },
  { label: 'Web · DOM', hot: false },
  { label: 'iOS · SwiftUI', hot: true },
  { label: 'Android · Compose', hot: true },
] as const

const Controls = el
  .config({ name: 'NativeControls' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap', marginBottom: 16 }))

const Panels = el
  .config({ name: 'NativePanels' })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 12 }))

const Stills = el
  .config({ name: 'NativeStills' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 10, sm: 20 }, listStyle: 'none', margin: 0, marginTop: 20, padding: 0, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }))

const StillFrame = el
  .config({ name: 'NativeStill' })
  .attrs({ tag: 'figure', block: true, gap: 8, contentAlignX: 'center' })
  .theme((_t, m) => ({ margin: 0, extendCss: `& img { border-radius: ${radius.note}px; border: 1px solid ${tone(m, 'line')}; }` }))

const Caption = txt
  .config({ name: 'NativeStillCaption' })
  .attrs({ tag: 'figcaption' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size - 1, lineHeight: 1.4, color: tone(m, 'fog'), textAlign: 'center' }))

const PanelHead = el.config({ name: 'NativePanelHead' }).attrs({ block: true }).theme(() => ({ paddingTop: 14, paddingLeft: 18, paddingRight: 18 }))

const Footer = el
  .config({ name: 'NativeFooter' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme(() => ({ flexWrap: 'wrap', marginTop: 16 }))

const STILLS: readonly { key: 'today-web' | 'today-ios' | 'today-android'; label: string }[] = [
  { key: 'today-web', label: 'Web · Chromium' },
  { key: 'today-ios', label: 'iOS · SwiftUI' },
  { key: 'today-android', label: 'Android · Compose' },
]

export default function DemoNative() {
  const source = signal<Source>('Stack')
  return (
    <KitScope>
      <div>
        <GlowCard>
          <Controls>
            <Eyebrow>source</Eyebrow>
            <Segmented label="Primitive" options={SOURCES} value={() => source()} onChange={(v) => source.set(v)} />
          </Controls>
          <Panels>
            <For each={PANELS.map((p, i) => ({ ...p, i }))} by={(p) => p.label}>
              {(p) => (
                <GlowCard padding="flush" state={p.hot ? 'hot' : 'default'}>
                  <PanelHead>
                    <Eyebrow state={p.hot ? 'accent' : 'default'}>{p.label}</Eyebrow>
                  </PanelHead>
                  <CodeBlock code={OUT[source()][p.i] ?? ''} label={p.label} />
                </GlowCard>
              )}
            </For>
          </Panels>
          <Footer>
            <SimulatedNote>Simulated: abridged output shown for illustration, not compiled live in this page. The real emit adds tokens, accessibility and modifiers.</SimulatedNote>
          </Footer>
        </GlowCard>
        <Stills aria-label="One app, Today, built from one TSX file">
          <For each={STILLS} by={(s) => s.key}>
            {(s) => (
              <li>
                <StillFrame>
                  <ThemedPicture data={stills[s.key] as ThemedPictureData} sizes="(min-width: 800px) 240px, 30vw" />
                  <Caption>{s.label}</Caption>
                </StillFrame>
              </li>
            )}
          </For>
        </Stills>
      </div>
    </KitScope>
  )
}
