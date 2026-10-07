import { PermissionsProvider, usePermissions } from '@pyreon/permissions'
import { Stack, Text, Show } from '@pyreon/primitives'

function Gate() {
  const can = usePermissions()
  return <Show when={can('posts.edit')}><Text>gated</Text></Show>
}

export function Literal() {
  return (
    <PermissionsProvider permissions={{ 'posts.edit': true, 'posts.delete': false, admin: true }}>
      <Gate />
      <Text>two children</Text>
    </PermissionsProvider>
  )
}

export function Wildcard() {
  return (
    <PermissionsProvider permissions={{ 'posts.*': true, 'posts.delete': false, 'users.**': true }}>
      <Gate />
    </PermissionsProvider>
  )
}

export function WildcardDeniedMany() {
  return (
    <PermissionsProvider permissions={{ '*': true, 'a.b': false, 'c.d': false }}>
      <Gate />
    </PermissionsProvider>
  )
}

export function Empty() {
  return <PermissionsProvider permissions={{ 'posts.edit': true }} />
}

export function NoChildrenNoGrants() {
  return <PermissionsProvider permissions={{}} />
}

export function Nested() {
  return (
    <Stack>
      <PermissionsProvider permissions={{ a: true }}>
        <PermissionsProvider permissions={{ b: true }}>
          <Gate />
        </PermissionsProvider>
      </PermissionsProvider>
    </Stack>
  )
}
