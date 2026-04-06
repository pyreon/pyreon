import { CalendarBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { calendarTheme } from './theme'

const Calendar = createComponent('Calendar', CalendarBase, calendarTheme)
export default Calendar
