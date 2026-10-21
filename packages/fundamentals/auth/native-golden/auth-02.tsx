// Shapes that WARN by design: config the native initialiser cannot bake is reported
// by name and nothing half-configured is emitted.
import { useOidc } from '@pyreon/auth'
import { Stack, Text, Button } from '@pyreon/primitives'

export function Dynamic(props: { issuer: string }) {
  const fromProps = useOidc({ issuer: props.issuer, clientId: 'app', redirectUri: 'com.example.app:/oauth' })
  const insecure = useOidc({ issuer: 'http://idp.example', clientId: 'app', redirectUri: 'com.example.app:/oauth' })
  const webRedirect = useOidc({ issuer: 'https://idp.example', clientId: 'app', redirectUri: 'https://app.example/cb' })
  return (
    <Stack>
      <Text>{fromProps.status()}</Text>
      <Text>{insecure.status()}</Text>
      <Button onPress={() => webRedirect.signOut({ postLogoutRedirectUri: 'x:/bye' })}>out</Button>
    </Stack>
  )
}
