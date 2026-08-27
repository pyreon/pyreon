---
'@pyreon/lathe': patch
---

Stop spec-controlled strings injecting code into generated files.

Flagged by CodeQL as "code construction depends on an improperly sanitized
value". Auditing the class found three real holes, none of them visible in the
emitted string:

- **A `//` line comment ends at the first line terminator.** A spec `title` of
  `T\nglobalThis.pwned=1;//` put executable code in every generated file's
  banner — the severe one, because a banner is the last place anyone looks.
- **A `/* */` block ends at `*/`.** A `description` containing it closed the
  JSDoc and dropped the remainder into code position.
- **`\r`, U+2028 and U+2029 are line terminators in JavaScript**, so an escaper
  handling only `\n` emitted string literals a spec enum value could end.

A fifth was the one the scanner actually pointed at, and the audit above missed
it by assuming identifiers were the safe part: parameter NAMES reached a TYPE
position raw, so a spec name of `a: string }, INJECTED: () => void, z: { b`
closed the type and injected an arbitrary parameter into the generated function
signature. It carried a correctness bug too — the path placeholder was already
normalized while the parameter name was not, so the two disagreed for any name
that was not already an identifier, and the emitted call set a key the endpoint
never read. Path parameter names now take the same normalization as their
placeholder; query names are wire names (`?page=2`) so they stay verbatim and
are quoted at emit instead.

A fourth hid one layer down: `JSON.stringify` leaves U+2028/U+2029 raw, so the
mock fixtures, the Atlas scenario args and quoted property keys all inherited
the third. Values bound for a line comment now have their line terminators
collapsed, block comments have `*/` broken, string literals escape all four
terminators plus the C0 controls (round-tripping, so the schema still matches
the spec), and JSON output is re-escaped before it reaches source.

The regression suite EXECUTES the emitted module and asserts no injected global
was set — every payload produces output that reads entirely plausibly, so a
string-level assertion passes against all of them.
