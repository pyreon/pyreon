import { getContext, hasContext, setContext } from 'svelte'
import Demo from './Demo'

const THEME = Symbol('theme')

function Consumer() {
  const theme = getContext<string>(THEME)
  const present = hasContext(THEME)
  return (
    <p>
      theme = <strong>{theme}</strong> · hasContext ={' '}
      <strong>{String(present)}</strong>
    </p>
  )
}

function Provider(props: { children?: unknown }) {
  setContext(THEME, 'dark')
  return props.children as never
}

export default function ContextDemo() {
  return (
    <Demo
      title="Context"
      apis="setContext, getContext, hasContext"
      code={`setContext(KEY, 'dark')
const theme = getContext(KEY)`}
    >
      <Provider>
        <Consumer />
      </Provider>
    </Demo>
  )
}
