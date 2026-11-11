import { el, tones } from '../../factory'
import { CalendarBase } from '@pyreon/ui-primitives'

const Calendar = el.config({ name: 'Calendar', component: CalendarBase }).theme((t, m) => ({
  backgroundColor: tones(t, m).surface,
  color: tones(t, m).text,
  borderWidth: t.borderWidth.base,
  borderStyle: t.borderStyle.base,
  borderColor: tones(t, m).border,
  borderRadius: t.borderRadius.medium,
  padding: t.spacing.xSmall,
}))

export default Calendar
