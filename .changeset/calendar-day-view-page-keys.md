---
'@pyreon/calendar': patch
---

`slotMove`: PageUp and PageDown now move in a one-day view. With a single column there was no week of columns to page through, so the keys clamped to the same day and did nothing; they now move seven slots up or down the day, kept inside the grid (the same seven steps a week view pages by).
