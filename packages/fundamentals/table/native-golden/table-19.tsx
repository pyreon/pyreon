import { signal } from '@pyreon/reactivity'
import { createTableState } from '@pyreon/table'
import { Stack, Text } from '@pyreon/primitives'
export function C(){ const rows = signal([{ id: 1 }]); const t = createTableState({ data: () => rows() }); return (<Stack><Text>{t.filteredCount()}</Text></Stack>) }
