import { createHttp } from '@pyreon/http'
import { SkipLink } from '@pyreon/a11y'
import { Stack, Text } from '@pyreon/primitives'
const api = createHttp({ baseUrl: '/api' })
export function S() { return (<Stack><Text>hi</Text></Stack>) }
