import { signal } from '@pyreon/reactivity'
import { useStorage, useFetch, useCounter, useToggle, useDebouncedValue, useThrottledCallback } from '@pyreon/hooks'
import { useForm, useFieldArray } from '@pyreon/form'
import { useUrlState } from '@pyreon/url-state'
import { useQuery } from '@pyreon/query'
type Resp = { ok: boolean }
export function App(){
  const n = signal(1)
  declare const k: string
  const f = useForm({ initialValues: { a: '' }, validators: { [`x${k}`]: (v) => '' } })
  return <Text>x</Text>
}
