import { transform } from './src/index'
import { validateKotlin } from './src/validate'
const r = transform(`
import { OptionChart } from '@pyreon/charts/plot'
export function App() {
  return <OptionChart option={{ xAxis: { type: 'category', data: ['Mon','Tue'] }, yAxis: {}, series: [{ type: 'bar', name: 'Sales', data: [30,10], label: { show: true, formatter: '{a}: {c}' } }] }} />
}`, { target: 'kotlin' })
console.error(JSON.stringify(validateKotlin(r.code)).slice(0, 800))
