import { useAuth } from '@pyreon/hooks'
import { Stack, Text, Button, Show } from '@pyreon/primitives'

type User = { id: string; name: string }

// A typed and an untyped container: the state machine's reads (call and member), the optional error and user, the bool getters.
export function Account() {
  const auth = useAuth<User>()
  const bare = useAuth()
  return (
    <Stack>
      <Text>{auth.status()}</Text>
      <Text>{auth.user()?.name ?? 'guest'}</Text>
      <Text>{auth.error ? 'failed' : 'ok'}</Text>
      <Text>{auth.error}</Text>
      <Show when={auth.isAuthenticated}><Text>in</Text></Show>
      <Show when={auth.isSigningIn}><Text>busy</Text></Show>
      <Button onPress={() => auth.beginSignIn()}>go</Button>
      <Button onPress={() => auth.signInSucceeded({ id: '1', name: 'a' })}>ok</Button>
      <Button onPress={() => auth.signOut()}>out</Button>
      <Text>{String(bare.status())}</Text>
    </Stack>
  )
}
