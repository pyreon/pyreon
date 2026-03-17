import { computed, ref } from "vue"
import Demo from "./Demo"

export default function ComputedDemo() {
  const firstName = ref("Vue")
  const lastName = ref("Compat")
  const fullName = computed(() => `${firstName.value} ${lastName.value}`)

  const raw = ref(5)
  const writable = computed({
    get: () => raw.value * 2,
    set: (v: number) => {
      raw.value = v / 2
    },
  })

  return (
    <Demo
      title="Computed"
      apis="computed"
      code={`const firstName = ref("Vue")
const lastName = ref("Compat")
const fullName = computed(() => \`\${firstName.value} \${lastName.value}\`)

// Writable computed
const raw = ref(5)
const doubled = computed({
  get: () => raw.value * 2,
  set: (v) => { raw.value = v / 2 },
})`}
    >
      <p>
        fullName: <strong>{fullName.value}</strong>
      </p>
      <div class="row">
        <button type="button" onClick={() => (firstName.value = "Pyreon")}>
          firstName = "Pyreon"
        </button>
        <button type="button" onClick={() => (lastName.value = "Framework")}>
          lastName = "Framework"
        </button>
      </div>
      <p>
        writable computed: <strong>{writable.value}</strong> (raw: {raw.value})
      </p>
      <div class="row">
        <button type="button" onClick={() => (writable.value = 20)}>
          Set to 20
        </button>
        <button type="button" onClick={() => raw.value++}>
          raw++
        </button>
      </div>
    </Demo>
  )
}
