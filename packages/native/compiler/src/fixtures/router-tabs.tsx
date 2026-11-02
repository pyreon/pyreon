// Tab-bar router (#4060): createRouter({ tabs }) + <Tabs router> + a <RouterView /> per tab.
// Compiled against the REAL iOS SDK + router-swift by real-runtime-typecheck.test.ts.
import { Stack, Text, Button, Tabs, Tab } from '@pyreon/primitives'
import { createRouter, useNavigate, RouterProvider, RouterView } from '@pyreon/router'
function FeedHome() {
  const navigate = useNavigate()
  return <Stack><Text>Feed</Text><Button onPress={() => navigate('/feed/post')}>Open</Button></Stack>
}
function FeedPost() { return <Text>Post</Text> }
function MeHome() { return <Text>Me</Text> }
export function TabsApp() {
  const router = createRouter({
    routes: [
      { path: '/feed', component: FeedHome },
      { path: '/feed/post', component: FeedPost },
      { path: '/me', component: MeHome },
    ],
    tabs: [
      { name: 'feed', root: '/feed' },
      { name: 'me', root: '/me' },
    ],
  })
  return (
    <RouterProvider router={router}>
      <Tabs router={router} data-testid="app-tabs">
        <Tab value="feed" label="Feed" icon="home" data-testid="tab-feed"><RouterView /></Tab>
        <Tab value="me" label="Me" icon="person" data-testid="tab-me"><RouterView /></Tab>
      </Tabs>
    </RouterProvider>
  )
}
