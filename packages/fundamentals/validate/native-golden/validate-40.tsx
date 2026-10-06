import { withField, s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
const F = withField(s.string(), { label: 'Label' })
export function S() { return (<Stack><Text>hi</Text></Stack>) }
