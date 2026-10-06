import { usePermissions } from '@pyreon/permissions'
import { Stack, Text, Show } from '@pyreon/primitives'

export function Seeded(props: { extra: string[] }) {
  const can = usePermissions(['posts.edit', 'posts.*'])
  const none = usePermissions([])
  const bare = usePermissions()
  const dyn = usePermissions(props.extra)
  const mixed = usePermissions(['a', props.extra[0], 1, 'b'])
  return (
    <Stack>
      <Show when={can('posts.edit')}><Text>edit</Text></Show>
      <Show when={none.can('x')}><Text>never</Text></Show>
      <Show when={bare.cannot('admin')}><Text>bare</Text></Show>
      <Show when={dyn.all('a', 'b')}><Text>dyn</Text></Show>
      <Show when={mixed.any('a', 'b')}><Text>mixed</Text></Show>
    </Stack>
  )
}
