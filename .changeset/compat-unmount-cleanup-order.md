---
'@pyreon/react-compat': patch
'@pyreon/preact-compat': patch
---

When a subtree unmounts, effect cleanups now run parent before child, as in React and Preact.

`useEffect` and `useLayoutEffect` cleanups (and `componentWillUnmount` for preact-compat class components) ran child-first, because they were registered as unmount hooks, which run after the component's subtree is torn down. They now run when the component's scope is stopped, which happens before its children are torn down. A parent cleanup that unregisters something its children registered with (or that expects its children to still be mounted) now sees the same order it would in React.
