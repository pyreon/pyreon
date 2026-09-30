import { Chart, Legend, Line, Tooltip } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — direct labels: `<Legend direct />` names each line at its last
 * point, in its own colour, instead of in a legend box. "Vary" regenerates
 * the three series; the labels follow the lines' ends.
 */
interface Row {
  month: string
  web: number
  ios: number
  android: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']

function make(): Row[] {
  let web = 400
  let ios = 250
  let android = 180
  return MONTHS.map((month) => {
    web += (Math.random() - 0.3) * 60
    ios += (Math.random() - 0.3) * 50
    android += (Math.random() - 0.2) * 50
    return { month, web: Math.round(web), ios: Math.round(ios), android: Math.round(android) }
  })
}

export default function GalleryDirectLabels(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const rows = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            rows.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <Chart<Row> data={() => rows()} x="month" title="Daily active users (thousands)" height={280}>
        <Line y="web" label="Web" width={2} />
        <Line y="ios" label="iOS" width={2} />
        <Line y="android" label="Android" width={2} />
        <Legend direct />
        <Tooltip />
      </Chart>
    </div>
  )
}
