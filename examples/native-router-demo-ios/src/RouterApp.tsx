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

import { onMount } from '@pyreon/core'
import { useSecureStorage } from '@pyreon/hooks'
import { Button, Heading, Inline, Layer, Link, Spacer, Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { createRouter, useNavigate, RouterProvider, RouterView } from '@pyreon/router'

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
          secrets.write('demo-secret', 's3cret')
          secretStatus.set(secrets.read('demo-secret') ?? 'none')
        }}
        data-testid="secure-save"
      >
        Save Secret
      </Button>
      <Inline gap={2}>
        <Button onPress={() => navigate('/about')}>Go to About</Button>
        <Button onPress={() => navigate('/users/42')}>View user 42</Button>
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
  return (
    <Stack gap={3} padding={4} data-testid="about-page">
      <Text>About</Text>
      <Text>Same source code compiled to native SwiftUI / Compose / DOM.</Text>
      <Button onPress={() => navigate('/')}>Back to Home</Button>
    </Stack>
  )
}

function UserPage(props: { params: { id: string } }) {
  const navigate = useNavigate()
  return (
    <Stack gap={3} padding={4} data-testid="user-page">
      <Text>User</Text>
      <Text>Profile for user {props.params.id}</Text>
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
    ],
  })

  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}
