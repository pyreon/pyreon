import { signal } from '@pyreon/reactivity'
import { useStorage, useFetch, useCounter, useToggle, useDebouncedValue, useThrottledCallback } from '@pyreon/hooks'
import { useForm, useFieldArray } from '@pyreon/form'
import { useUrlState } from '@pyreon/url-state'
import { useQuery } from '@pyreon/query'
type Resp = { ok: boolean }
export function App(){
  const n = signal(1)
  declare const q2: any
  const g = signal([[q2],[q2]])
  return <Text>x</Text>
}
