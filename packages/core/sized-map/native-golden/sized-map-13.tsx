import { SizedMap as Bounded } from '@pyreon/sized-map'
import { Stack } from '@pyreon/primitives'
export function C(){ const m = new Bounded<string, number>({ maxEntries: 3 }); return (<Stack />) }
