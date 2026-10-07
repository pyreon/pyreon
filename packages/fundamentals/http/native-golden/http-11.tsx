import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useHotkey } from '@pyreon/hotkeys'
import { useInterval, useTimeout, useFetch } from '@pyreon/hooks'
import { useParams, useLoaderData } from '@pyreon/router'
export function App(){
  const n = signal(0)
  const xs = signal([1,2])
  const [, b] = xs()
  return <Text>{String(n())}</Text>
}
