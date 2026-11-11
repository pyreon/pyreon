---
'@pyreon/lathe': patch
---

Native modules now give each number field the type the OpenAPI spec says it is: an `integer` field is typed `Int` and a `number` field is typed `Double`. These are cross-target aliases, declared in the module only when used (`type Int = number`). On the web both are still plain `number`. The native compiler reads them as a 64-bit integer and a Double. Before this change, a plain `number` field became an integer on iOS and Android. A fractional value then failed to decode wherever no response schema decided the type, as in a stream event. The native compiler now warns about every such field, so each generated stream module would have produced that warning.
