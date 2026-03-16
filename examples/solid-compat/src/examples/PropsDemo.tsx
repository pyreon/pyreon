import { mergeProps, splitProps } from "@pyreon/solid-compat"
import Demo from "./Demo"

function Greeting(props: { greeting?: string; name: string; class?: string }) {
  const merged = mergeProps({ greeting: "Hello" }, props)
  const [local, rest] = splitProps(merged, "greeting", "name")

  return (
    <p {...rest}>
      {local.greeting}, <strong>{local.name}</strong>!
    </p>
  )
}

export default function PropsDemo() {
  return (
    <Demo
      title="Props Utilities"
      apis="mergeProps, splitProps"
      code={`function Greeting(props) {
  // Provide defaults
  const merged = mergeProps(
    { greeting: "Hello" },
    props
  );
  // Separate local from pass-through
  const [local, rest] = splitProps(
    merged, ["greeting", "name"]
  );

  return <p {...rest}>{local.greeting}, {local.name}!</p>;
}`}
    >
      <Greeting name="World" />
      <Greeting greeting="Hey" name="Pyreon" class="highlight" />
      <Greeting greeting="Bonjour" name="Developer" />
    </Demo>
  )
}
