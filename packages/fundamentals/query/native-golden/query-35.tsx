import { signal, computed } from '@pyreon/reactivity'
import { useStorage, useSessionStorage, useMemoryStorage, useFetch, useCounter, useToggle, useDebouncedValue } from '@pyreon/hooks'
import { useWebSocket } from '@pyreon/hooks'
import { useQuery } from '@pyreon/query'
import { useForm, useFieldArray } from '@pyreon/form'
import { useUrlState } from '@pyreon/url-state'
export function App(){
  const c = useCounter(3, { min: 0, max: 9 })
  return <Button onPress={() => c.inc()}>{String(c.count())}</Button>
}
