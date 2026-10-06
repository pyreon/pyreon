import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
import { Text } from '@pyreon/primitives'
const k = 'name'
const U = zodSchema(z.object({ [k]: z.string(), age: z.number() }))
export function App() { return <Text>x</Text> }
