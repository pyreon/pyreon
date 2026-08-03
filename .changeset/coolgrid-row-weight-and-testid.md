---
'@pyreon/native-compiler': patch
---

Fix two Compose layout bugs in the `@pyreon/coolgrid` `<Col>` lowering, both found by measuring real geometry on a device.

- **A column span now lowers to RowScope `Modifier.weight(size)`, not `fillMaxWidth(size/12f)`.** A Compose `Row` measures each child against the REMAINING width, so fractional fills compound: a 3/12 column followed by a 9/12 column laid out as 25% + 56%, and the row never added up. `weight(3f)` + `weight(9f)` divides the row exactly — which is what a twelve-column grid means, and what the Swift twin's `containerRelativeFrame(count:span:)` did all along.
- **A `<Col>`'s `data-testid` now rides the SIZED node.** It was landing on the inner stack while the width lived on the wrapper `Box`, so the tagged node hugged its glyph — a 3/12 column measured 7.2dp of a 308dp row — and the column's real geometry was unaddressable, hence unassertable. Same class as the earlier `<Link>` identifier drop. Swift never had the split; it puts the identifier and the span on one node.

Both were invisible to the emit tests, which asserted the old `fillMaxWidth` string and passed throughout — a compile-level assertion can only confirm that the code agrees with itself. The emit tests are updated to the corrected truth and a new one locks the identifier onto the weighted node (exactly once, so `onNodeWithTag` stays unambiguous).
