import { signal, computed } from '@pyreon/reactivity'
import { useStorage, useSessionStorage, useMemoryStorage, useFetch, useCounter, useToggle, useDebouncedValue } from '@pyreon/hooks'
import { useWebSocket } from '@pyreon/hooks'
import { useQuery } from '@pyreon/query'
import { useForm, useFieldArray } from '@pyreon/form'
import { useUrlState } from '@pyreon/url-state'
type Resp = { ok: boolean }
export function App(){
  const n = signal(1)
  const q = useFetch<Resp>('https://x', { credentials: 'include' })
  return <Text>x</Text>
}
