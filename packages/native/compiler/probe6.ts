import { readFileSync } from 'node:fs'
import { transform } from './src/index'
const src = readFileSync('../../../examples/native-tasks/src/TasksApp.tsx', 'utf8')
const r = transform(src, { target: 'kotlin' })
const c = r.code
console.log('  navigatorCmds emitted :', c.includes('navigatorCmds'))
console.log('  navRect / nav drag    :', /navRect|pyreonNav/.test(c))
console.log('  warnings mentioning nav:', r.warnings.filter(w=>/navigator/i.test(String(w))).length)
for (const w of r.warnings) if (/navigator/i.test(String(w))) console.log('   -', String(w).slice(0,180))
