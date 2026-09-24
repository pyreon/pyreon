---
'@pyreon/zero-content': patch
---

fix(zero-content): clicking the search backdrop closes the search dialog

A click on the dimmed area around `<Search>`'s dialog did nothing, so the only ways out were Escape and the Close button. The backdrop now closes it and returns focus to where it was, as the Close button does. Clicks inside the dialog still leave it open.
