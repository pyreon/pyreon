import { children } from 'solid-js'
import Demo from './Demo'

function ColoredBox(props: { color: string; children?: any }) {
  const resolved = children(() => props.children)
  return (
    <div
      style={`border: 2px solid ${props.color}; padding: 8px; margin: 4px 0; border-radius: 6px;`}
    >
      {resolved()}
    </div>
  )
}

export default function ChildrenDemo() {
  return (
    <Demo
      title="Children Helper"
      apis="children"
      code={`function ColoredBox(props) {
  // Resolve and memoize children
  const resolved = children(() => props.children);

  return (
    <div style="border: 2px solid blue">
      {resolved}
    </div>
  );
}`}
    >
      <ColoredBox color="#4f46e5">
        <p>Inside an indigo box</p>
      </ColoredBox>
      <ColoredBox color="#059669">
        <p>Inside an emerald box</p>
      </ColoredBox>
    </Demo>
  )
}
