import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useHotkey } from '@pyreon/hotkeys'
import { useInterval, useTimeout, useFetch } from '@pyreon/hooks'
import { useParams, useLoaderData } from '@pyreon/router'
export function App(){
  const n = signal(0)
  const cb = () => n.set(1)
  onMount(cb)
  return <Text>{String(n())}</Text>
}
