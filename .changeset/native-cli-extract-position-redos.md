---
'@pyreon/native-cli': patch
---

`pyreon-native check` no longer backtracks polynomially when parsing a diagnostic's source position. A message containing `[` followed by a long run of spaces took ~13 s to scan; the position parser now takes each bracket group in one linear pass, with the same result for every real compiler/oxc message (CodeQL js/polynomial-redos).
