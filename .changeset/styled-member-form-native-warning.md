---
'@pyreon/styler': patch
---

On iOS and Android, `styled.div\`…\`` now explains why it does not lower: `div` has no native counterpart, so wrap a primitive instead (`styled(Stack)`). It previously got only the generic "tagged template literal is not supported" warning, which named the wrong cause. `styled('div')` already said this.
