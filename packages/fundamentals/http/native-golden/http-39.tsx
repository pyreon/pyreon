import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useHotkey } from '@pyreon/hotkeys'
import { useInterval, useTimeout, useFetch } from '@pyreon/hooks'
import { useParams, useLoaderData } from '@pyreon/router'
export function App(){
  const n = signal(0)
  const h = () => n.set(1)
  useHotkey('mod+k', h)
  return <Text>{String(n())}</Text>
}
