import rocketstyle from '@pyreon/rocketstyle'
import { CalendarBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { calendarTheme } from './theme'

const resolved = getComponentTheme(calendarTheme)

const Calendar = rocketstyle({ useBooleans: true })({ name: 'Calendar', component: CalendarBase as any })
  .theme(resolved.base)

export default Calendar
