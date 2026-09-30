---
'@pyreon/native-compiler': patch
---

`orient="vertical"` lowers on the Sankey, Calendar and Parallel hosts: the layout runs in the transposed box, the draw list goes through `pyreonTransposeCmds`, and a tap is reflected before its hit. A reactive `orient` is named instead of lowering as horizontal.
