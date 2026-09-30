import { GanttChart, type GanttTask } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a Gantt chart: tasks in lanes with progress, dependencies and a
 * milestone. "Vary" regenerates how far each task has got.
 */
function make(): GanttTask[] {
  const p = (): number => Math.round(Math.random() * 10) / 10
  return [
    { id: 'spec', name: 'Spec', group: 'Plan', start: '2026-03-02', end: '2026-03-09', progress: 1 },
    { id: 'design', name: 'Design', group: 'Plan', start: '2026-03-09', end: '2026-03-20', progress: p(), dependencies: ['spec'] },
    { id: 'api', name: 'API', group: 'Build', start: '2026-03-16', end: '2026-04-03', progress: p(), dependencies: ['spec'] },
    { id: 'ui', name: 'UI', group: 'Build', start: '2026-03-23', end: '2026-04-10', progress: p(), dependencies: ['design'] },
    { id: 'qa', name: 'QA', group: 'Ship', start: '2026-04-06', end: '2026-04-17', progress: p(), dependencies: ['api', 'ui'] },
    { id: 'launch', name: 'Launch', group: 'Ship', start: '2026-04-20', milestone: true, dependencies: ['qa'] },
  ]
}

export default function GalleryGantt(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const tasks = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            tasks.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <GanttChart tasks={() => tasks()} title="Release plan" height={320} />
    </div>
  )
}
