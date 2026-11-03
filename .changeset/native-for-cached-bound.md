---
'@pyreon/native-compiler': patch
---

The "cache the bound" loop, `for (let i = 0, n = xs.length; i < n; i++)`, now lowers to a native range loop on iOS and Android. A native range evaluates its bound once, which is what caching it in a second declarator does in JavaScript, so inlining the extra declarator into the test is exact. That holds only when the extra name is read in the test and nowhere else, and its initialiser doesn't read the counter. Any other use still warns, now with a message that names the cached-bound shape and the fix.
