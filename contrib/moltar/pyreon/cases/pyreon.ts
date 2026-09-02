import { s } from '@pyreon/validate';
import { createCase } from '../benchmarks';

// The benchmark's data shape, as defined by `benchmarks/parseSafe.ts`
// upstream. Every case below validates exactly this.
const shape = {
  number: s.number(),
  negNumber: s.number(),
  maxNumber: s.number(),
  string: s.string(),
  longString: s.string(),
  boolean: s.boolean(),
};

const nested = {
  foo: s.string(),
  num: s.number(),
  bool: s.boolean(),
};

// Validate, return the value, DROP unknown keys.
// `.strip()` is @pyreon/validate's default unknown-key policy, so this is the
// shape a user writes by default; it is spelled out here for symmetry with the
// strict/passthrough cases rather than relying on the default being obvious.
createCase('@pyreon/validate', 'parseSafe', () => {
  const dataType = s
    .object({ ...shape, deeplyNested: s.object(nested).strip() })
    .strip();

  return data => dataType.parseOrThrow(data);
});

// Validate, return the value, ERROR on unknown keys — root and nested.
createCase('@pyreon/validate', 'parseStrict', () => {
  const dataType = s
    .object({ ...shape, deeplyNested: s.object(nested).strict() })
    .strict();

  return data => dataType.parseOrThrow(data);
});

// Assert only: no output value is needed, so this uses `.is()` — the
// verdict-only path, which compiles a validator whose every failure site is a
// bare `return false` and which allocates neither issue objects nor a stripped
// clone. Wrapping a boolean check in a throw is the established shape for
// libraries with a boolean API here (see `sinclair-typebox-*`), and it is what
// the assert cases are for: `assertLoose`'s own docblock notes that skipping
// unknown-key checks "may provide massive speedups".
createCase('@pyreon/validate', 'assertLoose', () => {
  const dataType = s
    .object({ ...shape, deeplyNested: s.object(nested).passthrough() })
    .passthrough();

  return data => {
    if (!dataType.is(data)) {
      throw new Error('validation failure');
    }

    return true;
  };
});

createCase('@pyreon/validate', 'assertStrict', () => {
  const dataType = s
    .object({ ...shape, deeplyNested: s.object(nested).strict() })
    .strict();

  return data => {
    if (!dataType.is(data)) {
      throw new Error('validation failure');
    }

    return true;
  };
});
