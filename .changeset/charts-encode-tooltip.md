---
'@pyreon/charts': minor
---

`encode.tooltip` over a dataset resolves to the new `Series.extras` (`[{ label, numbers | texts }]`): the tooltip lists the named dimensions under the series value and the accessible table prints one column per extra. An unknown dimension warns by name and is skipped.
