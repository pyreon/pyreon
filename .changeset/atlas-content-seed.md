---
'@pyreon/atlas': minor
---

Seed every derived scenario with representative content. Discovery now reads the tag a rocketstyle component renders as and gives a text component its own name as an editable `children` control, an `<img>` a network-free placeholder `src` + `alt`, a field a `placeholder`, and a layout container (`Stack`, `Grid`, `Box`, `AspectRatio`, a `<ul>`/`<nav>`/`<table>` …) three placeholder blocks to arrange. The seed merges UNDER authored args, travels as JSON with the scenario, and is materialized by one `materializeContent` in the verify harness, the SSR-parity check and the generated workbench render — so the canvas shows what the scan verified. Before this every derived scenario mounted an empty element: the deployed `@pyreon/ui-components` workbench rendered 108 blank previews while reporting 1090/1090 verified.

The canvas frame is now BARE at the fluid viewport — the component sits directly on the dotted stage, with the brand/mode/locale context line in the canvas bar — and becomes a framed device edge only when a viewport preset pins a width.
