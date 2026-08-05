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
import { useAppState, useDatabase, useFetch, useOnline, usePush, useSecureStorage, useSizeClass, useWebSocket } from '@pyreon/hooks'
import { useFieldArray } from '@pyreon/form'
import { Button, Heading, Image, Inline, Layer, Link, Press, Spacer, Stack, Text, Video } from '@pyreon/primitives'
import { attrs } from '@pyreon/attrs'
import { Element } from '@pyreon/elements'
import { Col, Container, Row } from '@pyreon/coolgrid'
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
  // Typography + colour tokens — the styling row's remaining named absents.
  // body/display are DELIBERATELY absent from the compiler's DEFAULT_THEME
  // fontSize scale, so a rendered 16/34 can only have come from THIS
  // declaration surviving the parse→merge→resolve pipeline (the collectTheme
  // hand-enumeration bug dropped exactly these while fontWeight.bold kept
  // "working" off the default — masked-by-default).
  fontSize: { body: 16, display: 34 },
  color: { accent: '#ff3b30' },
})

const TightCard = styled(Stack)`
  padding: ${(t) => t.spacing.sm};
`

const RoomyCard = styled(Stack)`
  padding: ${(t) => t.spacing.xl};
`

// attrs(Base).attrs({…}) — the default-prop HOC @pyreon/rocketstyle builds
// on. `gap: 5` is the card's ONLY gap source (the use site passes padding,
// not gap), so the measured child spacing IS the default surviving the
// merge; a dropped chain falls back to the parent's spacing.
const AttrsCard = attrs(Stack).attrs({ gap: 5 })

// Typography from tokens → .font(.system(size:)) / fontSize = N.sp. Same
// glyph both lines, so the a11y-frame HEIGHT delta is purely the token values
// (iOS frames hug glyphs — height IS visible there, unlike container widths).
const BodyLine = styled(Text)`
  font-size: ${(t) => t.fontSize.body};
`

const DisplayLine = styled(Text)`
  font-size: ${(t) => t.fontSize.display};
`

// Colour from a token → .background(Color(...)) / Modifier.background(Color(0xFFFF3B30)).
// Android asserts the RENDERED PIXEL via captureToImage (the Media row's
// instrument) — closing "a token resolving to the wrong colour compiles
// perfectly" on one platform; iOS colour stays a disclosed follow-up
// (XCUITest cannot read pixels; a screenshot-diff instrument is tracked).
const AccentChip = styled(Text)`
  color: #ffffff;
  background-color: ${(t) => t.color.accent};
  padding: 8;
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

function AnimPage() {
  const navigate = useNavigate()
  // Animations row — ASYMMETRIC enter/leave lives on its OWN page, not on
  // MotionPage, and that is a finding rather than tidiness.
  //
  // MEASURED: with ONE <Transition> on a page, hiding and immediately
  // re-showing works. With THREE driven by the same signal, a re-show issued
  // while a leave is still in flight leaves every transition child absent
  // from the iOS accessibility tree, and it does not return (15s). The
  // pre-existing symmetric-duration test passes on a single-transition page
  // and fails on a three-transition one — verified both ways by removing and
  // restoring these boxes. Compose recovers from the identical interruption
  // on the virtual clock, so the shared source and both emits are sound; this
  // is SwiftUI transition-interruption behaviour, disclosed in the matrix.
  //
  // Keeping MotionPage at one transition preserves that gate honestly instead
  // of loosening it, and the two boxes here still give the one-instant
  // opposite-outcomes comparison the asymmetry proof needs.
  const on = signal<boolean>(true)
  return (
    <Stack gap={3} padding={4} data-testid="anim-page">
      <Text>Animations</Text>
      <Button onPress={() => on.set(!on())} data-testid="anim-toggle">
        Toggle Boxes
      </Button>
      {/* Animations row — ASYMMETRIC enter/leave, the row's named gap. The
          two boxes carry OPPOSITE configs and are driven by the SAME signal,
          so one instant discriminates: 1000ms after hiding, the slow-leave
          box is still mid-exit (2500ms) while the fast-leave box is already
          gone (200ms). A symmetric emit — one duration driving both sides,
          which is all the vocabulary supported before this — cannot produce
          opposite outcomes at the same moment no matter which duration it
          picks. Android asserts it on the compose rule's VIRTUAL clock, so
          the timing is deterministic rather than a wall-clock race. */}
      <Transition
        show={() => on()}
        enterDuration={200}
        leaveDuration={2500}
        easing="linear"
      >
        <Text data-testid="asym-slow-leave">Asym Slow Leave</Text>
      </Transition>
      <Transition
        show={() => on()}
        enterDuration={2500}
        leaveDuration={200}
        easing="linear"
      >
        <Text data-testid="asym-fast-leave">Asym Fast Leave</Text>
      </Transition>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}

function OfflinePage() {
  const navigate = useNavigate()
  // Offline/sync row — the OFFLINE-FIRST half, which is the part a real app
  // depends on and which sat at R2 (compiles, never run) while the row read
  // 0.0. Two independent claims, because neither alone is "works offline":
  //
  //   DURABILITY — a record written now must still be there after the process
  //   dies. The mounted read seeds the status from the DATABASE, so a value
  //   rendered after a relaunch can only have come off disk.
  //
  //   CONNECTIVITY — `useOnline()` must report the device's real state, so an
  //   app can tell "no data yet" from "no network". Android drives this as a
  //   live FLIP (radios off -> on) on one device; the iOS simulator has no
  //   supported per-app network toggle, so that half is disclosed, not faked.
  //
  // Writing this page is also what surfaced the `if (db.get(...))` gap: the
  // presence check below — read a row, branch on whether it exists — compiled
  // on NEITHER target until `database.get` joined SERVICE_METHOD_RETURNS.
  const net = useOnline()
  const db = useDatabase()
  const noteCount = signal<number>(0)
  const state = signal<string>('empty')
  onMount(() => {
    noteCount.set(db.count('notes'))
    const found = db.get('notes', 'n1')
    if (found) {
      state.set('restored')
    }
  })
  return (
    <Stack gap={3} padding={4} data-testid="offline-page">
      <Text>Offline</Text>
      <Text data-testid="net-status">Online: {net.isOnline}</Text>
      <Text data-testid="note-count">Notes: {noteCount()}</Text>
      <Text data-testid="note-state">State: {state()}</Text>
      <Button
        onPress={() => {
          db.insert('notes', { id: 'n1', fields: { body: 'written-offline' } })
          noteCount.set(db.count('notes'))
          state.set('written')
        }}
        data-testid="write-note"
      >
        Write Note
      </Button>
      <Button
        onPress={() => {
          db.delete('notes', 'n1')
          noteCount.set(db.count('notes'))
          state.set('cleared')
        }}
        data-testid="clear-note"
      >
        Clear Note
      </Button>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
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

function PushPage() {
  const navigate = useNavigate()
  // Background/push row — the RECEIPT half, which sat at 0.0 while both
  // runtimes shipped pure containers with a `start(register)` seam nobody
  // wired (the useOnline never-wired class). The emit now self-installs the
  // platform delivery pipeline:
  //
  //   iOS — a container-owned UNUserNotificationCenter delegate: foreground
  //   presentation + taps land in `notificationReceived`. `simctl push`
  //   injects a REAL APNs payload through exactly that pipeline, credential-
  //   free, which is what makes this device-provable at all. The APNs TOKEN
  //   half genuinely needs AppDelegate wiring + credentials — disclosed.
  //
  //   Android — a NOT_EXPORTED BroadcastReceiver on com.pyreon.runtime.PUSH:
  //   the app-internal delivery seam an FCM service forwards into. The
  //   instrumented test (same UID) broadcasts through it; FCM transport
  //   itself stays credential-blocked — disclosed.
  const push = usePush()
  return (
    <Stack gap={3} padding={4} data-testid="push-page">
      <Text>Push</Text>
      <Text data-testid="push-title">Push: {push.lastNotification?.title ?? 'none'}</Text>
      <Text data-testid="push-count">Count: {push.notifications.length}</Text>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}

function MediaPage() {
  const navigate = useNavigate()
  const videoStatus = signal<string>('waiting')
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
      {/* Video-row proof — the Media row's AV half, which had NO vocabulary.
          <Video> lowers to web <video> / AVKit VideoPlayer over AVPlayer /
          Media3 ExoPlayer in an AndroidView. The fixture's 1s clip plays
          autoPlay+muted+loop, and onStatusChange surfaces the player's REAL
          state (timeControlStatus KVO / ExoPlayer listener) into the status
          text — the assertion surface. Playback STATE is provable; rendered
          video FRAMES are not (surface layer, uncapturable by either
          harness — disclosed in the matrix). Loop so the 1s clip cannot
          race the poll back to "paused". */}
      <Video
        src="http://localhost:8790/clip.mp4"
        autoPlay
        muted
        loop
        height={120}
        onStatusChange={(s) => videoStatus.set(s)}
        data-testid="video-player"
      />
      <Text data-testid="video-status">Video: {videoStatus()}</Text>
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

      {/* Styling row — the two named gaps with no native example at all:
          @pyreon/coolgrid and @pyreon/elements' Element. Both LOWER (the
          styling table has listed them as supported all along) but neither
          had ever rendered on a device, so "supported" was a compile-level
          claim: a grid that silently collapses to full-width columns
          compiles perfectly.

          The 12-column split is deliberately ASYMMETRIC (3/9, not 6/6) so
          the geometry discriminates rather than merely existing:
            - a DROPPED grid leaves both columns at the row's left edge, so
              the right column's x-origin collapses onto the left one's;
            - a SWAPPED or defaulted span puts the boundary at the wrong
              fraction, which a 6/6 split could never reveal.
          Android reads the columns' real widths (getBoundsInRoot); iOS
          reads the right column's x-ORIGIN — XCUITest a11y frames hug
          glyphs, so a container's WIDTH is invisible there (the #2593
          lesson), but where a glyph STARTS is a real layout fact. */}
      <Container data-testid="grid-container">
        <Row>
          <Col size={3} data-testid="grid-col-narrow">
            <Text data-testid="grid-text-narrow">L</Text>
          </Col>
          <Col size={9} data-testid="grid-col-wide">
            <Text data-testid="grid-text-wide">R</Text>
          </Col>
        </Row>
      </Container>

      {/* Element with a padding scale step — lowers to VStack.padding(16) /
          Column(Modifier.padding(16.dp)). Padded boxes consume VERTICAL
          space exactly on both platforms (the token-padding proof's
          finding), so the child's vertical offset from the marker above it
          is the assertion on iOS; Android reads the box bounds directly. */}
      <Text data-testid="element-marker">marker</Text>
      <Element tag="div" padding={4} data-testid="element-box">
        <Text data-testid="element-child">boxed</Text>
      </Element>

      {/* Styling row — `@pyreon/attrs`, the last named absent with no native
          example at all. attrs(Base).attrs({…}) accumulates DEFAULT props
          over a base; the emit rewrites each use site to the base carrying
          those defaults, so the defaults must reach real LAYOUT to be worth
          anything. Geometry, not existence: the card's gap comes ONLY from
          the attrs default (gap 5 → 20pt/dp), and the use-site `padding`
          proves the merge order (use-site wins over the default). A dropped
          attrs chain lays the two texts out at the parent's gap instead —
          a 12pt/dp difference the harnesses can read on both platforms.

          Placed AFTER the Element block on purpose: the sibling padding
          proof measures the element-marker -> element-child OFFSET, so any
          node inserted between them is added to the number it asserts. The
          first draft sat in that span and moved it from ~28 to ~118dp — a
          real regression in a passing test, caused by adding a sibling
          rather than by touching either the emit or the assertion. An
          offset-based geometry assertion makes the SPAN between its two
          ids load-bearing; append to the page, never into it. */}
      <AttrsCard padding={3} data-testid="attrs-card">
        <Text data-testid="attrs-a">A</Text>
        <Text data-testid="attrs-b">B</Text>
      </AttrsCard>

      {/* Typography tokens: same glyph, sizes from different token leaves
          (body=16, display=34) — the glyph-box HEIGHT ratio pins both values
          on both platforms. Colour token: Android reads the chip's rendered
          pixel; iOS asserts existence only (disclosed). */}
      <BodyLine data-testid="typo-body">Aa</BodyLine>
      <DisplayLine data-testid="typo-display">Aa</DisplayLine>
      <AccentChip data-testid="accent-chip">chip</AccentChip>

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
        <Button onPress={() => navigate('/anim')}>View anim</Button>
      </Inline>
      <Inline gap={2}>
        <Button onPress={() => navigate('/offline')}>View offline</Button>
      </Inline>
      <Inline gap={2}>
        <Button onPress={() => navigate('/push')}>View push</Button>
        <Button onPress={() => navigate('/media')}>View media</Button>
        <Button onPress={() => navigate('/http')}>View http</Button>
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
      {/* The lifecycle route is reached from ABOUT, not from home. The home
          nav column is non-scrollable and AT its fold budget on the Android
          emulator: inserting a 24th button there pushed the adaptive-row
          markers past the fold, where Compose measures them at ZERO height
          and the size-class gap assertion read 0.0dp. The About page is
          short and its own tests already tap through it, so this is the
          insertion that does NOT spend fold budget — the alternative (making
          home scrollable) changes tap discipline for every existing test on
          both platforms and is a deliberate, separate decision. */}
      <Button onPress={() => navigate('/lifecycle')}>View lifecycle</Button>
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

// Networking-row proof — HTTP VERBS through the shared source.
//
// `useFetch(url, { method, headers, body })` is the shape an author reaches
// for, and until this arc every field of that init object was READ BY NOBODY:
// the parser only looked at argument[0], so both targets emitted a plain GET
// and the app silently performed the wrong verb with no diagnostic anywhere.
// It now lowers to `PyreonHttp` — a runtime that had shipped on BOTH targets
// with full verb support and nothing calling it (URLSession on iOS, and on
// Android an executor interface whose real OkHttp implementation this arc
// also had to write).
//
// The server REFLECTS what it received, so the assertion is on what actually
// reached the wire: a request that degraded to GET reads `Method: GET` rather
// than quietly passing. `/boom` answers 500 so the emitted isOK/isOk guard
// has something to reject on — a non-2xx must surface as an ERROR, not as a
// decode failure that reads like "the server sent bad JSON".
interface EchoReply {
  id: string
  method: string
  body: string
}

function LifecyclePage() {
  const navigate = useNavigate()
  // Platform-APIs row — app LIFECYCLE, the third member of the never-wired
  // class: PyreonAppState's Swift start() wired real UIApplication
  // notifications from inception and NO emit called it; the Kotlin container
  // had an injected seam and no Android edge at all. useAppState() reported
  // its initial "active" forever on both targets.
  //
  // The emit now self-starts observation (.onAppear { app.start() } on the
  // stable host / rememberPyreonAppState()'s LifecycleEventObserver). The
  // assertion surface is the STICKY wasBackgrounded flag: an end-state a
  // frozen container can never reach, independent of the exact number of
  // transition events a backgrounding path fires (which varies by OS). The
  // web hook returns a bare accessor with no such member — a native-only
  // read, same footing as the legacy net.isOnline member shape; on web this
  // line renders "BG: undefined" and no web test asserts it (disclosed).
  const app = useAppState()
  return (
    <Stack gap={3} padding={4} data-testid="lifecycle-page">
      <Text>Lifecycle</Text>
      <Text data-testid="phase-text">Phase: {app()}</Text>
      <Text data-testid="bg-flag">BG: {app.wasBackgrounded}</Text>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}

function HttpPage() {
  const navigate = useNavigate()
  const posted = useFetch<EchoReply>('http://localhost:8790/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"name":"pyreon"}',
  })
  const failed = useFetch<EchoReply>('http://localhost:8790/boom', { method: 'PUT' })
  return (
    <Stack gap={3} padding={4} data-testid="http-page">
      <Text>Http</Text>
      <Text data-testid="http-method">Method: {posted.data()?.method ?? 'none'}</Text>
      <Text data-testid="http-body">Body: {posted.data()?.body ?? 'none'}</Text>
      <Text data-testid="http-id">Id: {posted.data()?.id ?? 'none'}</Text>
      <Text data-testid="http-bad">Bad: {failed.error() ? 'rejected' : 'no'}</Text>
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
      { path: '/anim', component: AnimPage },
      { path: '/offline', component: OfflinePage },
      { path: '/push', component: PushPage },
      { path: '/lifecycle', component: LifecyclePage },
      { path: '/media', component: MediaPage },
      { path: '/http', component: HttpPage },
    ],
  })

  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}
