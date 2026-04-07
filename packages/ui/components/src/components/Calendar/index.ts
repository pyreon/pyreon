import { el } from '../../factory'
import { CalendarBase } from '@pyreon/ui-primitives'

const Calendar = el.config({ name: 'Calendar', component: CalendarBase }).theme((t) => ({
  backgroundColor: t.color.system.light.base,
  borderWidth: t.borderWidth.base,
  borderStyle: t.borderStyle.base,
  borderColor: t.color.system.base[200],
  borderRadius: t.borderRadius.medium,
  padding: t.spacing.xSmall,
}))

export default Calendar
