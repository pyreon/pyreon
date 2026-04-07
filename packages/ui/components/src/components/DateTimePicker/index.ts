import DatePicker from '../DatePicker'

/** DateTimePicker extends DatePicker with combined date + time selection. */
const DateTimePicker = DatePicker
  .config({ name: 'DateTimePicker' })
  .theme({ minWidth: '240px' })

export default DateTimePicker
