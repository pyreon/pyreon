import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
type Resp = { text: string }
export function C(){ const rows = signal<Resp[]>([]); const s = useSortable({ items: () => rows(), by: (r: Resp) => r.text, onReorder: (next: Resp[]) => rows.set(next) }); return (<Stack><Text>x</Text></Stack>) }
