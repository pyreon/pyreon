// @ts-nocheck — PMTC handles typing; see RouterApp.tsx.
//
// Navigation row (NAV-2): `useUrlState` round trips through the router's
// search params on a device. The tasks app asserts a string default and one
// write; this page proves both directions with every scalar codec:
//
// - IN: a deep link `pyreondemo://query?…` sets the values. Each read parses the
//   query text back into its type (an integer, a boolean, a list).
// - OUT: each button writes through `.set`, which serializes into the query,
//   and the label re-reads the parsed value — so a codec that writes one form
//   and reads another shows the wrong value, not the default.
//
// Building it found that a deep link dropped its query on both platforms, so a
// link could never set a value here.
import { Button, Inline, Stack, Text } from '@pyreon/primitives'
import { useNavigate } from '@pyreon/router'
import { useUrlState } from '@pyreon/url-state'

export function QueryPage() {
  const navigate = useNavigate()
  const term = useUrlState('q', '')
  const page = useUrlState('page', 1)
  const archived = useUrlState('archived', false)
  const tags = useUrlState('tags', ['news'])
  return (
    <Stack gap={2} padding={4} data-testid="query-page">
      <Text>Query</Text>
      <Text data-testid="query-term">Term: {term()}</Text>
      <Text data-testid="query-page-number">Page: {page()}</Text>
      <Text data-testid="query-archived">Archived: {archived() ? 'yes' : 'no'}</Text>
      <Text data-testid="query-tags">Tags: {tags().join('|')}</Text>
      <Inline gap={2}>
        <Button onPress={() => term.set('cats & dogs')}>Set term</Button>
        <Button onPress={() => page.set(page() + 1)}>Next page</Button>
      </Inline>
      <Inline gap={2}>
        <Button onPress={() => archived.set(!archived())}>Toggle archived</Button>
        <Button onPress={() => tags.set([...tags(), 'sport'])}>Add tag</Button>
      </Inline>
      <Inline gap={2}>
        <Button onPress={() => navigate('/about')}>Leave query</Button>
        <Button onPress={() => navigate('/')}>Back to Home</Button>
      </Inline>
    </Stack>
  )
}
