export function Card(props: { title: string; description: string }) {
  return (
    <Text>
      {props.title}: {props.description}
    </Text>
  )
}
