---
'@pyreon/calendar': minor
---

`businessHours` is now read through `@pyreon/schedule`'s `openingWindows`, so the time grid's shading and `constrainTo: 'businessHours'` agree with schedule's `isOpen` minute for minute. Breaking: a `BusinessCalendar` without `weekend` now closes Saturday and Sunday (schedule's default; it was no weekend), a holiday no longer cuts off the previous night's overnight window, and `specialHours` is honoured. A bare `WorkingHours` still opens every weekday it lists. Fixed on the way: a change ending exactly at closing time was refused by `constrainTo: 'businessHours'` (a rounding error in the minutes).
