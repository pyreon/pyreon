import { withField, s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
const emailField = withField(s.string(), { label: 'Email' })
export function G() {
  const rows = [{ a: 1, b: 'x' }, { a: 2, b: 'y' }]
  return (<Stack><Text>{String(rows.length)}</Text></Stack>)
}
