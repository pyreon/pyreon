import rocketstyle from '@pyreon/rocketstyle'
import { CalendarBase } from '@pyreon/ui-primitives'

const rs = rocketstyle({ useBooleans: true })

const Calendar = rs({ name: 'Calendar', component: CalendarBase })
  .theme((t: any) => ({
    backgroundColor: t.color.system.light.base,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[200],
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.xSmall,
  }))

export default Calendar
