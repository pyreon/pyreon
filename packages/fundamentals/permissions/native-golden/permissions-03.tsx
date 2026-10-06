import { PermissionsProvider } from '@pyreon/permissions'
import { Stack, Text } from '@pyreon/primitives'

const GRANTS = { 'posts.edit': true }

export function Variable() {
  return (
    <PermissionsProvider permissions={GRANTS}>
      <Text>variable map</Text>
    </PermissionsProvider>
  )
}

export function NonBoolean() {
  return (
    <PermissionsProvider permissions={{ a: 1, b: true }}>
      <Text>non boolean</Text>
    </PermissionsProvider>
  )
}

export function Missing() {
  return (
    <PermissionsProvider>
      <Text>no permissions attribute</Text>
    </PermissionsProvider>
  )
}

export function Spread(props: { cfg: object }) {
  return (
    <Stack>
      <PermissionsProvider {...props.cfg}><Text>spread</Text></PermissionsProvider>
    </Stack>
  )
}
