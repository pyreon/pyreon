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

import { Button, Inline, Link, Stack, Text } from '@pyreon/primitives'
import { createRouter, useNavigate, RouterProvider, RouterView } from '@pyreon/router'

function HomePage() {
  const navigate = useNavigate()
  return (
    <Stack gap={3} padding={4} data-testid="home-page">
      <Text>Home</Text>
      <Text>Welcome to the Pyreon multiplatform router demo.</Text>
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
