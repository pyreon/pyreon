import DatePicker from '../DatePicker'

/** DateRangePicker extends DatePicker with dual-calendar range selection. */
const DateRangePicker = DatePicker
  .config({ name: 'DateRangePicker' })
  .theme({ minWidth: '280px' })

export default DateRangePicker
