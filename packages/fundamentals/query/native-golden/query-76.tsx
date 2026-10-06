import { signal } from '@pyreon/reactivity'
import { useStorage, useFetch, useCounter, useToggle, useDebouncedValue, useThrottledCallback } from '@pyreon/hooks'
import { useForm, useFieldArray } from '@pyreon/form'
import { useUrlState } from '@pyreon/url-state'
import { useQuery } from '@pyreon/query'
type Resp = { ok: boolean }
export function App(){
  const n = signal(1)
  const p = signal(~3)
  return <Text>x</Text>
}
