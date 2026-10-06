import { withField, s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
const F = withField(s.string(), META)
export function S() { return (<Stack><Text>hi</Text></Stack>) }
