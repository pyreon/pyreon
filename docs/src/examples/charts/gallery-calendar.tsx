import { CalendarChart } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a calendar: one cell per day, keyed by ISO date. "Vary"
 * regenerates the daily counts.
 */
function make(): Record<string, number> {
  const out: Record<string, number> = {}
  const day = new Date(Date.UTC(2026, 0, 1))
  while (day.getUTCFullYear() === 2026 && day.getUTCMonth() < 6) {
    const weekday = day.getUTCDay()
    const base = weekday === 0 || weekday === 6 ? 1 : 6
    out[day.toISOString().slice(0, 10)] = Math.round(base + Math.random() * 8)
    day.setUTCDate(day.getUTCDate() + 1)
  }
  return out
}

export default function GalleryCalendar(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const values = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            values.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <CalendarChart start="2026-01-01" end="2026-06-30" values={() => values()} title="Commits per day" height={180} />
    </div>
  )
}
