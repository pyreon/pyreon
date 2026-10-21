import { useOidc } from '@pyreon/auth'
import { Stack, Text, Button, Show } from '@pyreon/primitives'

const ISSUER = 'https://accounts.example.com'

export function Account() {
  const auth = useOidc({
    issuer: ISSUER,
    clientId: 'app',
    redirectUri: 'https://app.example.com/callback',
    nativeRedirectUri: 'com.example.app:/oauth',
    scope: 'openid profile email offline_access',
    postLogoutRedirectUri: 'com.example.app:/bye',
    authorizationParams: { prompt: 'consent', access_type: 'offline' },
  })
  return (
    <Stack>
      <Text>{auth.status()}</Text>
      <Show when={auth.isAuthenticated()}>
        <Text>{auth.claim('email') ?? auth.subject() ?? ''}</Text>
        <Text>{auth.accessToken() ?? ''}</Text>
        <Button onPress={() => auth.refresh()}>Refresh</Button>
        <Button onPress={() => auth.signOut({ endProviderSession: true })}>Sign out everywhere</Button>
        <Button onPress={() => auth.signOut()}>Sign out</Button>
      </Show>
      <Show when={auth.status() !== 'signedIn'}>
        <Button onPress={() => auth.signIn()}>Sign in</Button>
      </Show>
      <Show when={auth.error() !== null}>
        <Text>{auth.error() ?? ''}</Text>
      </Show>
    </Stack>
  )
}
