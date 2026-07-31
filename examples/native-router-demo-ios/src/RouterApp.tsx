// @ts-nocheck — PMTC handles typing; tsc multi-child JSX limitations
// noisy. See native-todomvc-ios/src/TodoApp.tsx for the same pattern.
//
// PMTC Router Demo — the SINGLE source for web, iOS, and Android.
//
// Phase R1.3 — proves the multiplatform routing story end-to-end:
//   - 3 routes (`/`, `/about`, `/users/:id`)
//   - <Link> navigation
//   - useParams() reads dynamic route segment
//   - Home route renders at launch on all 3 targets (R1.1 closes iOS
//     blank-startup bug; R1.2 closes Android NavHost throws + state
//     disconnect)
//
// The web sibling's entry-client imports from this iOS path directly;
// the Android example would share via build script. ONE file, THREE
// targets — provable by `ls` + `diff`.

import { For, onMount } from '@pyreon/core'
import { useSecureStorage, useWebSocket } from '@pyreon/hooks'
import { useFieldArray } from '@pyreon/form'
import { Button, Heading, Inline, Layer, Link, Spacer, Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { createRouter, useNavigate, RouterProvider, RouterView } from '@pyreon/router'
import { defineTheme, styled } from '@pyreon/styler'

// Styling-row proof — defineTheme tokens driving styled(Prim) layout,
// GEOMETRY-assertable: the two cards' paddings come from DIFFERENT token
// leaves (sm=8, xl=40), so the device tests measure the child offsets and
// pin the token VALUES, not just "some padding applied" (a resolution that
// guessed, swapped, or defaulted the tokens produces the wrong offsets).
// PMTC bakes the literals at compile time; on web defineTheme is the typed
// identity helper (the web demo renders without a theme provider, so the
// interpolations are a native-lowering proof — disclosed, not implied).
// The binding is deliberately unused on web (the PMTC compiler consumes the
// declaration by CALLEE at compile time; the web demo runs without a theme
// provider) — underscore-named for lint.
const _theme = defineTheme({
  spacing: { sm: 8, xl: 40 },
})

const TightCard = styled(Stack)`
  padding: ${(t) => t.spacing.sm};
`

const RoomyCard = styled(Stack)`
  padding: ${(t) => t.spacing.xl};
`

function MotionPage() {
  const navigate = useNavigate()
  // Animations-row proof — CONFIGURED duration/easing. The slow box exits
  // over 2500ms (linear), so a timing WINDOW discriminates the config
  // end-to-end: shortly after hide it still EXISTS (mid-exit — the default
  // ~300ms animation would already have removed it), and it is GONE once
  // the configured duration elapses. Android asserts this on the compose
  // test rule's VIRTUAL clock (deterministic); iOS uses wall-time with
  // generous margins.
  const boxOn = signal<boolean>(true)
  return (
    <Stack gap={3} padding={4} data-testid="motion-page">
      <Text>Motion</Text>
      <Button onPress={() => boxOn.set(!boxOn())} data-testid="motion-toggle">
        Toggle Slow Box
      </Button>
      <Transition show={() => boxOn()} duration={2500} easing="linear">
        <Text data-testid="slow-box">Slow Box</Text>
      </Transition>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}

function StylesPage() {
  const navigate = useNavigate()
  return (
    <Stack gap={3} padding={4} data-testid="styles-page">
      <Text>Styles</Text>
      <TightCard data-testid="card-sm">
        <Text data-testid="card-sm-child">sm</Text>
      </TightCard>
      <RoomyCard data-testid="card-xl">
        <Text data-testid="card-xl-child">xl</Text>
      </RoomyCard>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}

function HomePage() {
  const navigate = useNavigate()
  // Storage-row proof — useSecureStorage, the encrypted secret store
  // (iOS Keychain / Android Keystore AES-GCM / web in-memory). The mounted
  // read seeds the status from the STORE, so after a relaunch the rendered
  // value can only come from the platform secret store — that read is what
  // the iOS terminate+relaunch device test asserts. The save handler reads
  // BACK through the store (not the value it just wrote), so the rendered
  // "s3cret" proves the write→read round trip, not a signal echo.
  const secrets = useSecureStorage()
  const secretStatus = signal<string>('none')
  onMount(() => {
    secretStatus.set(secrets.read('demo-secret') ?? 'none')
  })
  return (
    <Stack gap={3} padding={4} data-testid="home-page">
      <Text>Home</Text>
      <Text>Welcome to the Pyreon multiplatform router demo.</Text>
      <Text data-testid="secure-value">Secret: {secretStatus()}</Text>
      <Button
        onPress={() => {
          const ok = secrets.write('demo-secret', 's3cret')
          secretStatus.set(ok ? (secrets.read('demo-secret') ?? 'read-failed') : 'write-failed')
        }}
        data-testid="secure-save"
      >
        Save Secret
      </Button>
      {/* TWO nav rows deliberately: <Inline> is a NON-wrapping Row on
          Android (the documented overflow gotcha) — four buttons clipped
          "View motion" off-screen and its click silently no-oped. */}
      <Inline gap={2}>
        <Button onPress={() => navigate('/about')}>Go to About</Button>
        <Button onPress={() => navigate('/users/42')}>View user 42</Button>
      </Inline>
      <Inline gap={2}>
        <Button onPress={() => navigate('/styles')}>View styles</Button>
        <Button onPress={() => navigate('/motion')}>View motion</Button>
      </Inline>
      {/* Core-UI row closure — `Link` was listed "not individually asserted",
          and it had NO usage in any gated app despite this file's header
          claiming "<Link> navigation" (every nav here is useNavigate+Button).
          It lives here rather than in the counter because PyreonLink resolves
          `router?.push` from the SwiftUI environment: without a RouterProvider
          a tap is a silent no-op, which would assert nothing. */}
      <Link to="/about" data-testid="home-link-about">
        <Text>About via Link</Text>
      </Link>

      {/* Core-UI residual closure — Layer / Spacer / Heading, the last three
          canonical primitives without a dedicated behavioural assertion. They
          live HERE rather than in the counter deliberately: the counter's
          root column already overflows a phone screen, and a non-scrollable
          Compose Column measures past-the-fold children with the REMAINING
          height — i.e. ZERO — so geometry assertions there read 0-height
          rects (empirically confirmed on the pixel_6 profile). The router
          home screen holds everything in the first screenful on both
          platforms, so frames/bounds are real layout facts.

          Each primitive is asserted by GEOMETRY, not existence:

          Heading → iOS `.font(.title)` / Compose `typography.h5`. The
          discriminator is glyph-box HEIGHT vs a body-size Text — a Heading
          mis-emitted as body text collapses the difference. */}
      <Heading level={2} data-testid="core-heading">Core heading</Heading>

      {/* Spacer → iOS `Spacer()` / Compose `Spacer(Modifier.weight(1f))`
          inside an Inline (HStack/Row): the flexible gap PUSHES the siblings
          to the row's edges. A dropped Spacer leaves the texts adjacent, so
          the measured left-to-right gap IS the assertion. */}
      <Inline data-testid="spacer-row">
        <Text data-testid="spacer-left">L</Text>
        <Spacer />
        <Text data-testid="spacer-right">R</Text>
      </Inline>

      {/* Layer → iOS `ZStack` / Compose `Box`: children stack on the Z axis,
          so their frames INTERSECT — a mis-emit to a linear container
          (VStack/Column) lays them out disjoint. */}
      <Layer data-testid="core-layer">
        <Text data-testid="layer-under">under</Text>
        <Text data-testid="layer-over">over</Text>
      </Layer>
    </Stack>
  )
}

function AboutPage() {
  const navigate = useNavigate()
  // Forms-row proof — useFieldArray, the dynamic form-list container
  // (PyreonFieldArray on both native targets; the web @pyreon/form hook).
  // The device tests drive add + REMOVE-FIRST and assert the SURVIVOR row
  // is still rendered — the stable-keys claim: removing row 0 must not
  // re-key (and thereby remount) the rows below it.
  const tags = useFieldArray(['alpha'])
  return (
    <Stack gap={3} padding={4} data-testid="about-page">
      <Text>About</Text>
      <Text>Same source code compiled to native SwiftUI / Compose / DOM.</Text>
      <Text data-testid="tag-count">Tags: {tags.length()}</Text>
      <Button onPress={() => tags.append('beta')} data-testid="tag-add">
        Add Tag
      </Button>
      <Button onPress={() => tags.remove(0)} data-testid="tag-remove">
        Remove First
      </Button>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
      {/* The keyed list goes LAST: its Compose lowering is a LazyColumn,
          which fills the parent Column's remaining height — siblings after
          it would be measured at ZERO height (the counter's collapse
          class). Last position is also the idiomatic list-screen shape. */}
      <For each={tags.items()} by={(i) => i.key}>
        {(item) => <Text>tag: {item.value()}</Text>}
      </For>
    </Stack>
  )
}

function UserPage(props: { params: { id: string } }) {
  const navigate = useNavigate()
  // Networking-row proof — useWebSocket against a real loopback echo server
  // (scripts/ws-echo-server.ts). Auto-connect fires on mount (both targets
  // synthesize it), so "WS: open" proves the handshake completed through
  // the REAL network stack; the send button's echo ("Echo: echo:ping-42")
  // proves the full frame round trip re-rendered. Lives on the USER page so
  // only tests that navigate here ever touch the socket — no cross-test
  // flake when the server is down. localhost reaches the host on the iOS
  // Simulator natively and on the Android emulator via `adb reverse`.
  const ws = useWebSocket('ws://localhost:8790')
  return (
    <Stack gap={3} padding={4} data-testid="user-page">
      <Text>User</Text>
      <Text>Profile for user {props.params.id}</Text>
      <Text data-testid="ws-status">WS: {ws.isConnected() ? 'open' : 'closed'}</Text>
      <Text data-testid="ws-last">Echo: {ws.lastMessage() ?? 'none'}</Text>
      <Button onPress={() => ws.send('ping-42')} data-testid="ws-send">
        Send Ping
      </Button>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}

export function RouterApp() {
  // `mode: 'history'` is web-only (HTML5 pushState + path-based URLs).
  // PMTC's parser only reads `routes` from createRouter's options
  // object; `mode` silently flows through on web AND is ignored on
  // native — so this same source compiles cleanly to SwiftUI/Compose
  // (which use their own navigation stack abstractions).
  const router = createRouter({
    mode: 'history',
    routes: [
      { path: '/', component: HomePage },
      { path: '/about', component: AboutPage },
      { path: '/users/:id', component: UserPage },
      { path: '/styles', component: StylesPage },
      { path: '/motion', component: MotionPage },
    ],
  })

  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}
