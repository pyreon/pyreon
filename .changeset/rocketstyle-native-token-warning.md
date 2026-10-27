---
'@pyreon/rocketstyle': patch
---

The native warning for a dropped rocketstyle style value no longer says that theme-token resolution is "a tracked follow-up" and that you should use a literal "for now". Theme tokens such as `t.color.primary` do resolve on native when the theme defines them. The warning now says the value was neither a literal nor a resolvable theme token, and to use one of the two.
