---
'@pyreon/flow': patch
---

The native iOS flow view now routes every hardware key press through one public function, `pyreonFlowHandleKey`, instead of a private mapping inside the view. Behaviour is unchanged. The change lets the native test suite prove Return, Escape, Delete and Backspace, which the iOS simulator's UI-test tooling cannot deliver.
