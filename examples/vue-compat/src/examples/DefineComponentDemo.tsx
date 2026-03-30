import { defineComponent, ref } from 'vue'
import Demo from './Demo'

const Greeting = defineComponent({
  name: 'Greeting',
  setup(props: { name: string }) {
    const exclaim = ref(false)
    return () => (
      <p>
        Hello, <strong>{props.name}</strong>
        {exclaim.value ? '!' : '.'}
        <button
          type="button"
          onClick={() => (exclaim.value = !exclaim.value)}
          style="margin-left: 8px"
        >
          Toggle !
        </button>
      </p>
    )
  },
})

export default function DefineComponentDemo() {
  const name = ref('World')

  return (
    <Demo
      title="defineComponent"
      apis="defineComponent"
      code={`const Greeting = defineComponent({
  name: "Greeting",
  setup(props: { name: string }) {
    const exclaim = ref(false)
    return () => (
      <p>Hello, {props.name}{exclaim.value ? "!" : "."}</p>
    )
  },
})`}
    >
      <Greeting name={name.value} />
      <div class="row">
        <button type="button" onClick={() => (name.value = 'Pyreon')}>
          name = "Pyreon"
        </button>
        <button type="button" onClick={() => (name.value = 'Vue')}>
          name = "Vue"
        </button>
      </div>
    </Demo>
  )
}
