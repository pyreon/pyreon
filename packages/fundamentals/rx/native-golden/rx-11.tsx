import { pipe, map } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function C(){ const xs = signal([1,2]); const dbl = pipe(xs, map((n: number) => n * 2)); return (<Stack><Text>{dbl().length}</Text></Stack>) }
