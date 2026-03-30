import { Cell, cell } from "../cell";

describe("Cell", () => {
  test("stores and reads initial value", () => {
    const c = cell(42);
    expect(c.peek()).toBe(42);
  });

  test("set() updates value", () => {
    const c = cell("hello");
    c.set("world");
    expect(c.peek()).toBe("world");
  });

  test("set() skips when value is the same (Object.is)", () => {
    const c = cell(1);
    let calls = 0;
    c.listen(() => calls++);
    c.set(1);
    expect(calls).toBe(0);
  });

  test("update() applies function to current value", () => {
    const c = cell(10);
    c.update((v) => v + 5);
    expect(c.peek()).toBe(15);
  });

  test("listen() fires on set()", () => {
    const c = cell("a");
    let fired = false;
    c.listen(() => {
      fired = true;
    });
    c.set("b");
    expect(fired).toBe(true);
  });

  test("listen() single-listener fast path (no Set allocated)", () => {
    const c = cell(0);
    let count = 0;
    c.listen(() => count++);
    // Should use _l fast path, not _s Set
    expect(c._s).toBeNull();
    expect(c._l).not.toBeNull();
    c.set(1);
    expect(count).toBe(1);
  });

  test("listen() promotes to Set with multiple listeners", () => {
    const c = cell(0);
    let a = 0;
    let b = 0;
    c.listen(() => a++);
    c.listen(() => b++);
    expect(c._s).not.toBeNull();
    expect(c._l).toBeNull();
    c.set(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  test("subscribe() returns working unsubscribe (single listener)", () => {
    const c = cell(0);
    let count = 0;
    const unsub = c.subscribe(() => count++);
    c.set(1);
    expect(count).toBe(1);
    unsub();
    c.set(2);
    expect(count).toBe(1); // no more notifications
  });

  test("subscribe() returns working unsubscribe (multi listener)", () => {
    const c = cell(0);
    let a = 0;
    let b = 0;
    c.listen(() => a++);
    const unsub = c.subscribe(() => b++);
    c.set(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
    unsub();
    c.set(2);
    expect(a).toBe(2);
    expect(b).toBe(1); // unsubscribed
  });

  test("cell() factory returns Cell instance", () => {
    const c = cell("x");
    expect(c).toBeInstanceOf(Cell);
  });

  test("multiple rapid updates notify correctly", () => {
    const c = cell(0);
    const values: number[] = [];
    c.listen(() => values.push(c.peek()));
    c.set(1);
    c.set(2);
    c.set(3);
    expect(values).toEqual([1, 2, 3]);
  });

  test("NaN equality (Object.is)", () => {
    const c = cell(Number.NaN);
    let calls = 0;
    c.listen(() => calls++);
    c.set(Number.NaN);
    expect(calls).toBe(0); // Object.is(NaN, NaN) is true
  });

  test("subscribe() unsubscribe works after promotion to Set (regression)", () => {
    // Bug: first subscriber's disposer became stale after second subscriber
    // promoted _l → _s. The disposer checked _l which was now null.
    const c = cell(0);
    let count1 = 0;
    let count2 = 0;
    const unsub1 = c.subscribe(() => count1++);
    const unsub2 = c.subscribe(() => count2++);

    c.set(1);
    expect(count1).toBe(1);
    expect(count2).toBe(1);

    // Unsubscribe first listener — must remove from _s Set
    unsub1();
    c.set(2);
    expect(count1).toBe(1); // should NOT fire again
    expect(count2).toBe(2);

    // Unsubscribe second listener
    unsub2();
    c.set(3);
    expect(count1).toBe(1);
    expect(count2).toBe(2);
  });

  test("subscribe() unsubscribe order: second before first", () => {
    const c = cell(0);
    let count1 = 0;
    let count2 = 0;
    const unsub1 = c.subscribe(() => count1++);
    const unsub2 = c.subscribe(() => count2++);

    c.set(1);
    expect(count1).toBe(1);
    expect(count2).toBe(1);

    unsub2();
    c.set(2);
    expect(count1).toBe(2);
    expect(count2).toBe(1);

    unsub1();
    c.set(3);
    expect(count1).toBe(2);
    expect(count2).toBe(1);
  });
});
