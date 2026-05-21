export function Card(props: { title: string }) {
  return <Text>{props.title}</Text>
}

export function App() {
  return <Card title="Hello" />
}
