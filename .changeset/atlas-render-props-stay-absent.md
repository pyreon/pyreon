---
'@pyreon/atlas': patch
---

Keep optional render props absent in generated catalogs instead of replacing them with action-log callbacks, preventing components such as Combobox from rendering an empty preview. Also keep Docs scenario navigation from being miscompiled into a chained call that throws instead of selecting the scenario.
