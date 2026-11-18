import { computed } from '@pyreon/reactivity'
import { useToday } from '@pyreon/time'
import { readDay, writeDate } from './civil'
import { nextOccurrence, occursOn } from './recurrence'
import type { PlainDate, PlainValue, Recurrence } from './types'

/**
 * Does the rule occur today? An accessor that flips at local midnight, in the rule's `timeZone` or else the active time zone
 * (the one `@pyreon/time` tracks). Call it in a component's setup.
 *
 * @example typeof useOccursToday({ every: 'day', start: '2026-11-18' }) // => 'function'
 */
export function useOccursToday(rule: Recurrence): () => boolean {
  const today = useToday(rule.timeZone)

  return computed(() => occursOn(rule, today()))
}

/**
 * The next occurrence from today on (today included), as an accessor that moves on at local midnight, in the rule's
 * `timeZone` or else the active time zone. It is day-accurate: an occurrence earlier today still counts until midnight.
 *
 * @example typeof useNextOccurrence({ every: 'week', start: '2026-11-18' }) // => 'function'
 */
export function useNextOccurrence(rule: Recurrence): () => PlainValue | null {
  const today = useToday(rule.timeZone)

  return computed(() => nextOccurrence(rule, dayBefore(today())))
}

function dayBefore(date: PlainDate): PlainDate {
  return writeDate(readDay('useNextOccurrence', 'today', date) - 1)
}
