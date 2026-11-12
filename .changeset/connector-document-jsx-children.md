---
'@pyreon/connector-document': patch
---

`extractDocumentTree` (and so `extractDocNode` / `useDocumentExport`) no longer drops every child from a template written in JSX. The automatic JSX runtime puts a component's children in `props.children` and leaves `vnode.children` empty; the extractor now reads children by the runtime's rule (`props.children` when set, else `vnode.children`). Components and `.attrs()` callbacks also receive compiler reactive-prop thunks as values (getters), as the runtime gives them, so a prop such as `level={props.level}` or `ordered={props.ordered}` exports its value instead of a function.
