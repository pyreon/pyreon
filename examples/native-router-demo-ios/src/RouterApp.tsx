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
import { useSecureStorage, useSizeClass, useWebSocket } from '@pyreon/hooks'
import { useFieldArray } from '@pyreon/form'
import { Button, Heading, Image, Inline, Layer, Link, Press, Spacer, Stack, Text } from '@pyreon/primitives'
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

function BigListPage() {
  const navigate = useNavigate()
  // Lists-at-scale proof — 10,000 keyed rows through the canonical
  // <Scroll><For> idiom. The lowering claims under test: iOS wraps the
  // ForEach in a LazyVStack (a bare ForEach in a ScrollView is EAGER —
  // 10k rows materialized up front); Android drops the redundant scroll
  // wrapper and lets the LazyColumn scroll itself (nesting it in a
  // verticalScroll Column is a Compose MEASURE-time crash). The device
  // tests assert LAZINESS (an off-screen deep row is NOT in the
  // semantics/a11y tree at launch — an eager build would carry all 10k)
  // and reachability (Android scrolls to Row 9999; iOS asserts scroll
  // advances — XCUITest has no deep-jump primitive, disclosed).
  // Array.from({length},(_,i)=>…) lowers to the idiomatic range-map on
  // both targets — and building THIS page found + fixed a real emitter
  // bug: the range-map's index param was never seeded into the emit-time
  // inference ctx, so the object literal bailed struct synthesis and
  // emitted a labelled TUPLE (Swift: key paths break ForEach(id:\.id);
  // Kotlin: named-tuple syntax is a syntax error). Now both emit a
  // synthesized __Obj record. (The helper-with-loop shape is still out:
  // helper BODIES don't yet type empty-array locals or translate .push —
  // the tracked helper-arc frontier.)
  const rows = Array.from({ length: 10000 }, (_, i) => ({ id: i, label: `Row ${i}` }))
  return (
    <Stack gap={2} padding={4} data-testid="biglist-page">
      <Text>Big List</Text>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
      <Scroll data-testid="biglist-scroll">
        <For each={rows} by={(r) => r.id}>
          {(r) => <Text>{r.label}</Text>}
        </For>
      </Scroll>
    </Stack>
  )
}

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
  // Gestures-row proof — the swipe vocabulary (<Press onSwipeLeft/onSwipeRight>).
  // iOS lowers to a simultaneous DragGesture, Android to
  // pointerInput { detectHorizontalDragGestures }, web to a pointer-delta
  // polyfill. The status text discriminates THREE outcomes: 'left'/'right'
  // (the swipe fired), 'tap' (the gesture degraded to a press — the
  // coexistence failure mode), 'none' (nothing fired) — so a dropped
  // emit, a flipped threshold sign, and a tap-swallowing drag each read
  // differently in the device tests, which inject REAL swipes (XCUITest
  // swipeLeft() / Compose performTouchInput). Lives on this sparse page
  // so the zone sits in the first screenful on both platforms
  // (coordinate gestures need on-screen bounds — the counter-fold lesson).
  const swipeDir = signal<string>('none')
  return (
    <Stack gap={3} padding={4} data-testid="motion-page">
      <Text>Motion</Text>
      <Text data-testid="swipe-status">Swiped: {swipeDir()}</Text>
      <Press
        onPress={() => swipeDir.set('tap')}
        onSwipeLeft={() => swipeDir.set('left')}
        onSwipeRight={() => swipeDir.set('right')}
        data-testid="swipe-zone"
      >
        <Text>← Swipe this zone →</Text>
      </Press>
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

function MediaPage() {
  const navigate = useNavigate()
  // Media-row proof — a REMOTE image through the real network stack.
  // <Image src="http…"> lowers to SwiftUI AsyncImage(url:) / Coil
  // AsyncImage(model=) / web <img>. The fixture server (the ws-echo
  // server's /dot.png route) serves a solid-RED 48x48 PNG over plain
  // HTTP, and the device tests assert the RENDERED PIXEL is red —
  // fetched, decoded, drawn. A placeholder, a failed fetch (ATS block,
  // missing Coil artifact, dead server), or a dropped remote emit all
  // read as not-red. Same literal URL on both platforms: the iOS sim
  // shares host loopback; Android maps it via `adb reverse tcp:8790`.
  // Infra this page surfaced: iOS needed NSAllowsLocalNetworking (ATS
  // gates URLSession cleartext — the ws test never hit it because the
  // ws runtime rides Network.framework, outside ATS); Android needed
  // the io.coil-kt:coil-compose ARTIFACT (the conditional import
  // resolved against nothing — the dep half of the stub-masked class).
  return (
    <Stack gap={3} padding={4} data-testid="media-page">
      <Text>Media</Text>
      <Image
        src="http://localhost:8790/dot.png"
        alt="remote red dot"
        width={48}
        height={48}
        data-testid="remote-dot"
      />
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}

function A11yPage() {
  const navigate = useNavigate()
  // Accessibility-row proof — the three neutral a11y props landing in the
  // REAL platform accessibility trees (not just the emit):
  //
  //   accessibilityRole="button" on a plain <Text> — the discriminating
  //   shape: a Press/Button carries the trait natively, so only a
  //   NON-button element proves the ROLE prop did the work. iOS asserts
  //   the element surfaces under XCUIApplication.buttons (XCUITest derives
  //   the element TYPE from the trait — a static text is only queryable
  //   there if .isButton actually landed); Android asserts the semantics
  //   node carries Role.Button.
  //
  //   accessibilityRole="header" — Android asserts the Heading semantics
  //   key is defined (the TalkBack rotor grouping). iOS `.isHeader` stays
  //   emit-locked: XCUITest does not surface the header trait as an
  //   element type or queryable property (same tooling limitation as
  //   accessibilityHidden on iOS, disclosed in the matrix).
  //
  //   accessibilityHidden on a decorative <Text> — Android asserts the
  //   node is ABSENT from the semantics tree by TEXT (clearAndSetSemantics
  //   clears text semantics too, so onNodeWithText finds nothing) with the
  //   visible sibling as the positive control proving the query works.
  //   Deliberately NO data-testid on the hidden node: testTag is itself a
  //   semantics property, and pinning the interaction between testTag and
  //   clearAndSetSemantics ordering is not what this row proves.
  return (
    <Stack gap={3} padding={4} data-testid="a11y-page">
      <Text accessibilityRole="header" data-testid="a11y-header">Accessibility</Text>
      <Text accessibilityRole="button" accessibilityLabel="Add item" data-testid="a11y-fake-button">+</Text>
      <Text data-testid="a11y-plain">plain sibling</Text>
      <Text accessibilityHidden>decorative-glyphs</Text>
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
  const sizeClass = useSizeClass()
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
      <Inline gap={2}>
        <Button onPress={() => navigate('/biglist')}>View big list</Button>
        <Button onPress={() => navigate('/a11y')}>View a11y</Button>
      </Inline>
      <Inline gap={2}>
        <Button onPress={() => navigate('/media')}>View media</Button>
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

      {/* Adaptive-row proof — RESPONSIVE PROP VALUES keyed on the size
          class (the row's "full responsive props absent" gap): the stack's
          gap + padding take DIFFERENT literals per class (compact 2→8dp/pt,
          regular 6→24dp/pt on the 4x scale), so GEOMETRY discriminates the
          resolved class end-to-end. Android proves the FLIP deterministically
          on one device (`wm size` resize re-derives screenWidthDp →
          recomposition); iOS asserts the compact values on the iPhone sim
          (the regular half is the size-class READ already device-proven on
          iPad — M2.2). */}
      <Stack
        gap={sizeClass() === 'regular' ? 6 : 2}
        padding={sizeClass() === 'regular' ? 8 : 2}
        data-testid="adaptive-box"
      >
        <Text data-testid="adaptive-a">A</Text>
        <Text data-testid="adaptive-b">B</Text>
      </Stack>
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
      { path: '/biglist', component: BigListPage },
      { path: '/a11y', component: A11yPage },
      { path: '/media', component: MediaPage },
    ],
  })

  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}
