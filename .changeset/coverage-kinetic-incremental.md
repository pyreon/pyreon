---
"@pyreon/kinetic": patch
---

test(kinetic): +4 real tests for Stagger; branches 91.15 → 92.47

Stagger prop-default arms — interval/appear/reverseLeave/timeout nullish defaults; reverseLeave + show:false; non-array single child; explicit override path.

Threshold bumped 91 → 92. Remaining ~3pp gap to MINIMUM_BRANCH_FLOOR=95 in animation lifecycle defensive arms exercised by kinetic.browser.test.tsx + ui-showcase e2e.
