---
'@pyreon/form': patch
---

A `useFieldArray` row can be edited from its own row on iOS and Android: `item.value.set(text)` from a `<Field>` in the row, and `item.value.update(fn)`. The native row is a value type, so the generic signal write (`item.value = text`) compiled on neither target, and the compiler gave no warning. The form plugin now routes the write through the array by the row's key (`PyreonFieldArray.setValue(key:)`). Edits therefore keep landing in the right row after an earlier row is removed.
