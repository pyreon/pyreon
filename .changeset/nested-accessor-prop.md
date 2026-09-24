---
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

A prop whose accessor returns another accessor now resolves to its value. The compiler inlines a function-valued `const` passed as a prop on a spread element (`const tabIndexFor = () => …; <div {...rest} tabIndex={tabIndexFor} />`) into `() => (() => …)`, and `applyProp` resolved only the outer level. `el.tabIndex` then received a function and became 0 on every item, so roving focus in Radio, Tabs and SegmentedControl made every item a tab stop, with one dev warning per item. The `pyreon doctor diagnose` entry for that warning now explains this shape too.
