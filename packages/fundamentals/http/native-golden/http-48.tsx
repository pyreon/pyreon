import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
type Resp = { text: string }
export function C(){ const f = useFetch("https://x.dev/a"); return (<Stack><Text>x</Text></Stack>) }
